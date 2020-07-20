import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { BillingMode } from "./dynamodb";
import { Resource } from "@pulumi/pulumi";

interface CapacitySettings {
    "min": number, "max": number, "target": number
}

interface TableCapacitySettings {
    "readCapacity": CapacitySettings,
    "writeCapacity": CapacitySettings
}

export interface CapacityPlan extends Record<string, TableCapacitySettings> {
}



export function registerDynamoDbCapacityPlan(plan: CapacityPlan): void {
    pulumi.runtime.registerStackTransformation((args) => {
        if (args.type != "aws:dynamodb/table:Table" || !plan[args.name]) return;
        if (args.props["billingMode"] !== BillingMode.PROVISIONED) {
            args.props["readCapacity"] = 5;
            args.props["writeCapacity"] = 5;
            args.props["billingMode"] = BillingMode.PROVISIONED;
        }
        args.props["tags"]["billingMode"] = BillingMode.PROVISIONED;
        // args.opts.ignoreChanges = ["readCapacity", "writeCapacity"];
        createTableAutoScalingPolicy(args.name, plan[args.name], args.resource);
        return { props: args.props, opts: args.opts };
    });
}

function createTableAutoScalingPolicy(tableName: string, settings: TableCapacitySettings, resource: Resource) {
    createAutoScalingPolicy(tableName, settings.readCapacity, "Read", resource);
    createAutoScalingPolicy(tableName, settings.writeCapacity, "Write", resource);
}

function createAutoScalingPolicy(tableName: string, settings: CapacitySettings, operation: "Read" | "Write", resource: Resource) {
    const dynamodbTableTarget = new aws.appautoscaling.Target(`aas-${tableName}-${operation}-target`, {
        maxCapacity: settings.max,
        minCapacity: settings.min,
        resourceId: `table/${tableName}`,
        scalableDimension: `dynamodb:table:${operation}CapacityUnits`,
        serviceNamespace: "dynamodb",
    }, { dependsOn: resource });
    const dynamodbTablePolicy = new aws.appautoscaling.Policy(`aas-${tableName}-${operation}-policy`, {
        policyType: "TargetTrackingScaling",
        resourceId: dynamodbTableTarget.resourceId,
        scalableDimension: dynamodbTableTarget.scalableDimension,
        serviceNamespace: dynamodbTableTarget.serviceNamespace,
        targetTrackingScalingPolicyConfiguration: {
            predefinedMetricSpecification: {
                predefinedMetricType: `DynamoDB${operation}CapacityUtilization`,
            },
            targetValue: settings.target,
        },
    }, { dependsOn: resource });
}
