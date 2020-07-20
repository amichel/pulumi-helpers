import * as pulumi from "@pulumi/pulumi";
import { ComponentResourceOptions, Input } from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { CustomDeploymentComponent } from "../pulumi/CustomDeployment";
import { Callback, Context } from '@pulumi/aws/lambda';
import { BackendLambda } from "./BackendLambda";
import { ManagedPolicies } from "@pulumi/aws/iam";
import { IamFactory } from "./iam";
import { IStackConfig } from "../pulumi/IStackConfig";
import { StackConfig } from "../config/StackConfig";
import * as cfsign from "aws-cloudfront-sign"

export interface ISignedUrlLambdaConfig { keypairId: string; pvkSecretId: string; ttl: number; domain: string; }

export class CloudfrontSignedUrlLambda extends CustomDeploymentComponent {
    public backendLambda: BackendLambda;
    public lambdaArn = () => this.backendLambda.lambda.arn;
    private stackConfig: IStackConfig;
    private config: ISignedUrlLambdaConfig;
    constructor(name: string, config: ISignedUrlLambdaConfig,
        policies: Input<string>[] = [], stackConfig: IStackConfig = new StackConfig(), opts?: ComponentResourceOptions) {
        super("CreateSignedUrlLambda", `CreateSignedUrlLambda-${name}`, opts);
        this.config = config;
        this.stackConfig = stackConfig;
        const stack = pulumi.getStack();

        const lambdaRole = IamFactory.createServiceRoleWithPolicy(`lambdaRoleCreateSignedUrl-${stack}`, ["lambda"],
            [...policies!, ManagedPolicies.AWSLambdaBasicExecutionRole]);

        this.backendLambda = new BackendLambda(name, {
            callbackFactory: this.callbackFactory,
            role: lambdaRole,
            environment: {
                variables: {
                    "keypairId": config.keypairId,
                    "pvkSecretId": config.pvkSecretId,
                    "ttl": config.ttl.toString(),
                    "domain": config.domain
                }
            }
        });

        this.addDependencies(this.backendLambda);
    }

    private callbackFactory(): Callback<any, Record<string, any>> {
        const aws = require('aws-sdk');
        const secretsmanager = new aws.SecretsManager();
        const cfpvkSecretParams = {
            SecretId: process.env.pvkSecretId
        };
        const basePath = `https://${process.env.domain}`

        return async function scanDynamoTable(event: {
            path: string
        }, context: Context): Promise<Record<string, any>> {
            context.callbackWaitsForEmptyEventLoop = false;
            try {
                let now = new Date();
                let expires = now.setSeconds(now.getSeconds() + Number(process.env.ttl));
                return new Promise((resolve, reject) => secretsmanager.getSecretValue(cfpvkSecretParams, function (err: Error, secret: any) {
                    if (err) throw err;
                    else {
                        try {
                            var signingParams = {
                                keypairId: process.env.keypairId,
                                privateKeyString: secret.SecretString,
                                expireTime: expires
                            }

                            //TODO: validate inputs for XSS?

                            var signedUrl = cfsign.getSignedUrl(
                                `https://${process.env.domain}/${event.path}`,
                                signingParams
                            );
                            console.log({ "url": signedUrl, "expires": new Date(expires).toISOString() });
                            resolve({ "url": signedUrl, "expires": new Date(expires).toISOString() });
                        } catch (error) {
                            console.log(error);
                            throw new Error("Request failed");
                        }
                    }
                }));
            } catch (error) {
                console.log(error);
                throw error;
            }
        }
    }

    public withExecutePermission(restApiId: Input<string>): CloudfrontSignedUrlLambda {
        this.backendLambda.withExecutePermission("apigateway", pulumi.interpolate`arn:aws:execute-api:${aws.config.region}:${this.stackConfig.accountId}:${restApiId}/*/GET/*`);
        return this;
    }
}