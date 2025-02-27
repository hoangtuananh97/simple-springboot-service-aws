# Simple Springboot Service AWS with FluentBit

Steps to deploy a simple springboot service to AWS using CDK
1. An opensource springboot app from https://github.com/TechWithHazem/simple-springboot-service-aws/tree/main/springboot-application
2. Clone the repository
3. Install `Java` and `Maven` on your local machine
4. In `springboot-application` folder, Build the project using `mvn package`
5. Run web locally.

## Steps to deploy the springboot service to AWS using CDK
1. Install `Node.js` and `npm` on your local machine
2. Install AWS CDK using `npm install -g aws-cdk`
3. Create a new CDK project using `cdk init app --language typescript`
4. Run `cdk diff` to check the changes that will be made to the AWS resources
5. Run `cdk synth` to check the generated CloudFormation template
6. Run `cdk deploy` to deploy the resources to AWS