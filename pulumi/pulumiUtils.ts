import * as pulumi from "@pulumi/pulumi";
import * as config from "../../config";
import { StackReference } from "@pulumi/pulumi";

export function getStackRef(stackName: string): StackReference {
    return new StackReference(`${stackName}-stackref}`, { name: `${config.stackConfig.org}/${pulumi.getProject()}/${stackName}` });
}