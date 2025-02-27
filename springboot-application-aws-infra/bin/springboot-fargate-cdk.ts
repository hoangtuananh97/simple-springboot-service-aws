#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {SpringbootFargateCdkStack} from '../lib/springboot-fargate-cdk-stack';
import {EcrStack} from "../lib/ecr-stack";

const app = new cdk.App();
const DEFAULT_REGION = 'ap-northeast-1';

const ecrStack = new EcrStack(app, 'HTAExampleEcrStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: DEFAULT_REGION,
  },
});

new SpringbootFargateCdkStack(app, 'HTAExampleApp', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: DEFAULT_REGION,
  },
  ecrSpringBootRepository: ecrStack.springBootRepository,
  ecrFirelensRepository: ecrStack.firelensRepository,
  ecrCwAgentRepository: ecrStack.cwAgentRepository,
});