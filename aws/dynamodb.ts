import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { Policy } from "@pulumi/aws/iam";


export enum DynamoDbActions {
    DescribeTable = "DescribeTable",
    BatchWriteItem = "BatchWriteItem",
    TransactWriteItems = "TransactWriteItems",
    DeleteItem = "DeleteItem",
    UpdateItem = "UpdateItem",
    PutItem = "PutItem",
    BatchGetItem = "BatchGetItem",
    GetItem = "GetItem",
    Query = "Query",
    Scan = "Scan",
    TransactGetItems = "TransactGetItems"
}

export enum BillingMode {
    PROVISIONED = "PROVISIONED",
    PAY_PER_REQUEST = "PAY_PER_REQUEST"
}

export class DynamoDbFactory {

    public static createWriterPolicy(stack: string = pulumi.getStack(), actions: DynamoDbActions[] = [DynamoDbActions.BatchGetItem,
    DynamoDbActions.BatchWriteItem, DynamoDbActions.DeleteItem,
    DynamoDbActions.GetItem, DynamoDbActions.PutItem,
    DynamoDbActions.UpdateItem, DynamoDbActions.Scan, DynamoDbActions.Query]): Policy {
        return this.createTableAccessPolicy("UpdateAllTables", actions, stack);
    }

    public static createScanPolicy(stack: string = pulumi.getStack(), actions: DynamoDbActions[] = [DynamoDbActions.Scan]): Policy {
        return this.createTableAccessPolicy("ScanAllTables", actions, stack);
    }

    public static createTableAccessPolicy(name: string, actions: DynamoDbActions[], stack: string = pulumi.getStack()): Policy {
        let dynamoActions = actions.map(a => `dynamodb:${a}`);

        return new aws.iam.Policy(`${name}-dynamo-policy`, {
            policy: JSON.stringify({
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Sid": name,
                        "Effect": "Allow",
                        "Action": dynamoActions,
                        "Resource": `arn:aws:dynamodb:${aws.config.region}:*:table/*-${stack}`
                    }
                ]
            })
        })
    };
}