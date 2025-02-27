import * as cdk from 'aws-cdk-lib';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ecr from "aws-cdk-lib/aws-ecr";
import { Construct } from 'constructs';

interface FargateCdkStackProps extends cdk.StackProps {
  ecrSpringBootRepository: ecr.Repository;
  ecrFirelensRepository: ecr.Repository;
  ecrCwAgentRepository: ecr.Repository;
}
export class SpringbootFargateCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FargateCdkStackProps) {
    super(scope, id, props);

    const ENV = process.env.ENV || 'hta-example';

    // Create a VPC
    const vpc = new ec2.Vpc(this, `${ENV}-springboot-application-vpc`, {
      maxAzs: 2,
      natGateways: 1
    })

    // Create a ECS Cluster
    const exampleApplicationCluster = new ecs.Cluster(this, "application-cluster", {
      vpc,
      clusterName: `${ENV}-springboot-application-cluster`
    })

    /*-----Config Containers-----*/
    // S3
    const springBootBucket = new s3.Bucket(this, 'hta-example-springboot-bucket', {
      bucketName: `${ENV}-springboot-bucket`,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Define an ECS task definition with a single container
    const taskDefinition = new ecs.FargateTaskDefinition(this, `${ENV}-springboot-TaskDef`, {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    // Add SpringBoot container
    const containerWeb = taskDefinition.addContainer(`${ENV}-springboot-web`, {
      // TODO: in real-world, you should use `ecs.ContainerImage.fromEcrRepository(props.ecrSpringBootRepository)` instead
      image: ecs.ContainerImage.fromAsset('../springboot-application'),
      logging: ecs.LogDrivers.firelens({
        tag: `${ENV}-springboot-application-log-firelens`,
        options: {
          "region": "ap-northeast-1",
          "bucket": springBootBucket.bucketName,
          "retry_limit": "2",
          "use_put_object": "On",
          "upload_timeout": "1m",
          "total_file_size": "10MB",
          "Name": "s3"
        }
      }),
      containerName: `${ENV}-springboot-web`,
      portMappings: [{ containerPort: 8080 }]
    });

    // Add CloudWatch Agent container
    const cwAgentContainer = taskDefinition.addContainer(`${ENV}-springboot-cwagent`, {
      // TODO: in real-world, you should use `ecs.ContainerImage.fromEcrRepository(props.ecrCwAgentRepository)` instead
      image: ecs.ContainerImage.fromRegistry("public.ecr.aws/cloudwatch-agent/cloudwatch-agent:latest"),
      cpu: 128,
      memoryLimitMiB: 64,
      portMappings: [
        { containerPort: 4316, hostPort: 4316, protocol: ecs.Protocol.TCP },
        { containerPort: 4317, hostPort: 4317, protocol: ecs.Protocol.TCP },
        { containerPort: 2000, hostPort: 2000, protocol: ecs.Protocol.UDP },
      ],
      logging: ecs.LogDrivers.firelens({
        tag: `${ENV}-springboot-application-cw-agent-log-firelens`,
        options: {
          "region": "ap-northeast-1",
          "bucket": springBootBucket.bucketName,
          "retry_limit": "2",
          "use_put_object": "On",
          "upload_timeout": "1m",
          "total_file_size": "10MB",
          "Name": "s3"
        }
      }),
      environment: {
        TZ: 'Asia/Tokyo',
        AWS_PROFILE: 'default',
        AWS_REGION: 'ap-northeast-1',
        CWAGENT_ONPREMISE: 'true',
        ECS_CONTAINER_METADATA_URI_V4: '',
        CWAGENT_LOG_LEVEL: 'error',
        OTEL_JAVAAGENT_DEBUG: 'true',
        OTEL_LOG_LEVEL: 'debug',
        CW_CONFIG_CONTENT: '{"traces":{"traces_collected":{"application_signals":{}}},"logs":{"metrics_collected":{"application_signals":{}}},"agent":{"metrics_collection_interval":60,"run_as_user":"root"},"metrics":{"namespace":"JavaAppMetrics","metrics_collected":{"disk":{"resources":["*"],"measurement":["free","total","used"],"metrics_collection_interval":60},"mem":{"measurement":["mem_used","mem_cached","mem_total"],"metrics_collection_interval":60}}}}',
      },
    });

    // Add Firelens container
    taskDefinition.addFirelensLogRouter('firelens', {
      // TODO: in real-world, you should use `ecs.ContainerImage.fromEcrRepository(props.ecrFirelensRepository)` instead
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/aws-observability/aws-for-fluent-bit:stable'),
      essential: true,
      containerName: `${ENV}-firelens`,
      firelensConfig: {
        type: ecs.FirelensLogRouterType.FLUENTBIT,
        // TODO: Configuration file type
        // options: {
        //   configFileType: ecs.FirelensConfigFileType.FILE,
        //   configFileValue: '/fluent-bit/etc/fluent-bit.conf',
        //   enableECSLogMetadata: false,
        // }
      },
      memoryReservationMiB: 50,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'firelens',
        logRetention: logs.RetentionDays.ONE_MONTH,
      })
    })

    /*-------------------*/
    // Create a load-balanced Fargate service and make it public
    const exampleApp = new ecs_patterns.ApplicationLoadBalancedFargateService(this,'hta-example-springboot-load-balanced-application', {
      cluster: exampleApplicationCluster,
      desiredCount: 2,
      cpu: 256,
      memoryLimitMiB: 512,
      minHealthyPercent: 50,
      taskDefinition: taskDefinition
    })

    // Allow the task definition to write to the bucket
    exampleApp.taskDefinition.addToTaskRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "s3:PutObject",
      ],
      resources: [
        springBootBucket.bucketArn,
        `${springBootBucket.bucketArn}/*`
      ]
    }))

    // Allow the task definition to write to CloudWatch Logs
    taskDefinition.taskRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess')
    );

    // Allow the task definition to write to CloudWatch
    exampleApp.taskDefinition.addToTaskRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'cloudwatch:PutMetricData'
        ],
        resources: ['*']
      })
    );

    // Configure health check to the target group
    exampleApp.targetGroup.configureHealthCheck({
      port: 'traffic-port',
      path: '/actuator/health',
      interval: cdk.Duration.seconds(5),
      timeout: cdk.Duration.seconds(4),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 2,
      healthyHttpCodes: "200,301,302"
    })

    // Auto Scaling
    const springbootAutoScaling = exampleApp.service.autoScaleTaskCount({
      maxCapacity: 4,
      minCapacity: 2
    })

    // Auto Scaling on CPU Utilization
    springbootAutoScaling.scaleOnCpuUtilization('cpu-autoscaling', {
      targetUtilizationPercent: 70,
      policyName: `${ENV}-springboot-cpu-autoscaling`,
      scaleInCooldown: cdk.Duration.seconds(30),
      scaleOutCooldown: cdk.Duration.seconds(30)
    })
  }
}
