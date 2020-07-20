import * as pulumi from "@pulumi/pulumi";
import { shallowMerge } from "../utils/tsutils";
import * as config from "../../config";
import { ComponentResource } from "@pulumi/pulumi";

export abstract class CustomDeploymentComponent extends ComponentResource {
    constructor(type: string, name: string, opts?: pulumi.ComponentResourceOptions | undefined) {
        super(`${config.stackConfig.org}:${type}`, name, undefined, opts);
    }

    protected Outputs: Record<string, any> = {};
    protected OutgoingDependencies: any[] = [];

    protected addOutput(key: string, value: any) {
        this.Outputs[`${this.constructor["name"]}.${key}`] = value;
    }

    public withOutputs(outputs: any): CustomDeploymentComponent {
        shallowMerge(this.Outputs, outputs);
        return this;
    }

    protected addDependencies(...values: any[]) {
        this.OutgoingDependencies.push(values);
    }

    public withDependencies(dependencies: any): CustomDeploymentComponent {
        shallowMerge(this.OutgoingDependencies, dependencies);
        return this;
    }

    protected get org(): string {
        return config.stackConfig.org;
    }
}
