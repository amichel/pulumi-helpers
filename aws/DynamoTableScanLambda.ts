import * as pulumi from "@pulumi/pulumi";
import { ComponentResourceOptions, Input } from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { CustomDeploymentComponent } from "../pulumi/CustomDeployment";
import { Callback, Context } from '@pulumi/aws/lambda';
import { BackendLambda } from "./BackendLambda";
import { ManagedPolicies } from "@pulumi/aws/iam";
import { IamFactory } from "./iam";
import { DynamoDbFactory } from "./dynamodb";
import { IStackConfig } from "../pulumi/IStackConfig";
import { StackConfig } from "../config/StackConfig";

export class DynamoTableScanLambda extends CustomDeploymentComponent {
    public backendLambda: BackendLambda;
    public lambdaArn = () => this.backendLambda.lambda.arn;
    private stackConfig: IStackConfig;
    constructor(name: string, stackConfig: IStackConfig = new StackConfig(), opts?: ComponentResourceOptions) {
        super("DynamoTableScanLambda", `DynamoTableScanLambda-${name}`, opts);
        this.stackConfig = stackConfig;
        const stack = pulumi.getStack();
        const lambdaRole = IamFactory.createServiceRoleWithPolicy(`lambdaRoleDynamoDbScan-${stack}`, ["lambda"],
            [DynamoDbFactory.createScanPolicy().arn, ManagedPolicies.AWSLambdaBasicExecutionRole]);

        this.backendLambda = new BackendLambda(name, {
            callbackFactory: this.callbackFactory,
            role: lambdaRole
        });

        this.addDependencies(this.backendLambda);
    }

    private callbackFactory(): Callback<any, Record<string, any>> {
        const aws = require('aws-sdk');
        const docClient = new aws.DynamoDB.DocumentClient();

        return async function scanDynamoTable(event: {
            TableName: string,
            KeyColumns: string[],
            ValueColumns: string[],
            ProjectionExpression: string | undefined,
            FilterExpression: string | undefined,
            ExpressionAttributeNames: object | undefined,
            ExpressionAttributeValues: object | undefined
        }, context: Context): Promise<Record<string, any>> {
            context.callbackWaitsForEmptyEventLoop = false;
            try {
                let params: any = {
                    TableName: event.TableName,
                    ProjectionExpression: event.ProjectionExpression,
                    FilterExpression: event.FilterExpression,
                    ExpressionAttributeNames: event.ExpressionAttributeNames,
                    ExpressionAttributeValues: event.ExpressionAttributeValues
                };

                let keyExtractor = (row: any): string => { return event.KeyColumns.map(c => row[c]).join("_") };
                let valueExtractor = (row: any): any => { return tryParse(event.ValueColumns.length == 1 ? row[event.ValueColumns[0]] : event.ValueColumns.map(c => row[c])) };
                let valuesOnly: boolean = event.KeyColumns.length == 0;
                let result: Record<string, any> | any[] = valuesOnly ? [] : {};
                let rowTransformer = valuesOnly ? (row: any): void => { (result as any[]).push(valueExtractor(row)) } :
                    (row: any): void => { (result as Record<string, any>)[keyExtractor(row)] = valueExtractor(row) };

                function tryParse(value: any) {
                    try {
                        return JSON.parse(value);
                    } catch{
                        return value;
                    }
                }

                async function scan() {
                    return new Promise((resolve, reject) => {
                        docClient.scan(params, async (err: Error, data: any) => {
                            if (err) {
                                reject(err);
                            } else {
                                data.Items.forEach(function (row: any) {
                                    rowTransformer(row);
                                });

                                if (typeof data.LastEvaluatedKey != "undefined") {
                                    params.ExclusiveStartKey = data.LastEvaluatedKey;
                                    await scan();
                                }

                                resolve();
                            }
                        })
                    });
                }

                await scan();
                return result;

            } catch (error) {
                console.log(error);
                throw error;
            }
        }
    }

    public withExecutePermission(restApiId: Input<string>): DynamoTableScanLambda {
        this.backendLambda.withExecutePermission("apigateway", pulumi.interpolate`arn:aws:execute-api:${aws.config.region}:${this.stackConfig.accountId}:${restApiId}/*/GET/*`);
        return this;
    }
}