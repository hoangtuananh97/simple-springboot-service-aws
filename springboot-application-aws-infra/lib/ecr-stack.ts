import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as assets from 'aws-cdk-lib/aws-ecr-assets';
import * as path from 'path';

export class EcrStack extends cdk.Stack {
  public readonly springBootRepository: ecr.Repository;
  public readonly cwAgentRepository: ecr.Repository;
  public readonly firelensRepository: ecr.Repository;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const ENV = process.env.ENV || 'hta';

    // Create ECR Repository
    const createECRRepository = (repositoryName: string, constructor_id: string) => {
      return new ecr.Repository(this, constructor_id, {
        repositoryName: repositoryName,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        lifecycleRules: [
          {
            rulePriority: 1,
            tagStatus: ecr.TagStatus.TAGGED,
            tagPrefixList: [`${ENV}-`],
            maxImageCount: 10,
          },
        ],
      });
    }

    const dockerImage = new assets.DockerImageAsset(this, 'MyDockerImage', {
      directory: path.join(__dirname, '../springboot-application'),
    });

    this.springBootRepository = createECRRepository(
      `${ENV}-ecr/springboot`,
      `${ENV}${"springboot".charAt(0).toUpperCase() + "springboot".slice(1)}Repository`
    );
    this.firelensRepository = createECRRepository(
      `${ENV}-ecr/firelens`, `${ENV}FirelensRepository`
    )
    this.cwAgentRepository = createECRRepository(
      `${ENV}-ecr/cwagent`, `${ENV}CWAgentRepository`
    )
  }
}