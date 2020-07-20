import { ComponentResourceOptions, Input, Output } from "@pulumi/pulumi";
import { CustomDeploymentComponent } from "../pulumi/CustomDeployment";
import { CallbackFunction, NodeJS12dXRuntime, CallbackFunctionArgs, Permission } from '@pulumi/aws/lambda';
import { lambda } from "@pulumi/aws";

export class BackendLambda extends CustomDeploymentComponent {
    public lambda: CallbackFunction<any, void>;
    private name: string;
    
    constructor(name: string, functionArgs: CallbackFunctionArgs<any, any>, opts?: ComponentResourceOptions) {
        super("BackendLambda", `BackendLambda-${name}`, opts);
        this.name = name;
        this.lambda = new CallbackFunction(name, {
            callbackFactory: functionArgs.callbackFactory,
            timeout: functionArgs.timeout ?? 30,
            runtime: functionArgs.runtime ?? NodeJS12dXRuntime,
            environment: functionArgs.environment,
            deadLetterConfig: functionArgs.deadLetterConfig,
            role: functionArgs.role,
            policies: [...functionArgs.policies ?? []],
        })
        this.addDependencies(lambda);
    }

    public withExecutePermission(service: string, sourceArn: Input<string>): BackendLambda {
        const permission = new Permission(`${this.name}-invoke`, {
            function: this.lambda,
            action: "lambda:InvokeFunction",
            principal: `${service}.amazonaws.com`,
            sourceArn: sourceArn
        });
        return this;
    }
}