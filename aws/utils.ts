import * as pulumi from "@pulumi/pulumi";
import { getArn } from "@pulumi/aws";

export function getResourceFromPolicyArn(arn: string) {
    return pulumi.output(getArn({ arn: arn })).resource.apply(r => { return r.split("/").pop() });
}