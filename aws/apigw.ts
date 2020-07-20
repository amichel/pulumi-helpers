export enum HttpMethod {
    DELETE = "DELETE",
    GET = "GET",
    PATCH = "PATCH",
    POST = "POST",
    PUT = "PUT"
}

export enum AuthorizationMethod {
    NONE = "NONE",
    CUSTOM = "CUSTOM",
    AWS_IAM = "AWS_IAM",
    COGNITO_USER_POOLS = "COGNITO_USER_POOLS"
}

export enum IntegrationType {
    HTTP = "HTTP",// (for HTTP backends), 
    MOCK = "MOCK",// (not calling any real backend), 
    AWS = "AWS",// (for AWS services), 
    AWS_PROXY = "AWS_PROXY",// (for Lambda proxy integration)
    HTTP_PROXY = "HTTP_PROXY"
}

export enum PassThroughBehavior {
    WHEN_NO_MATCH = "WHEN_NO_MATCH",
    WHEN_NO_TEMPLATES = "WHEN_NO_TEMPLATES",
    NEVER = "NEVER"
}

export enum RequestParamType {
    HEADER = "header",
    QUERY = "querystring",
    PATH = "path"
}

export enum EndpointType {
    REGIONAL = "REGIONAL",
    EDGE = "EDGE"
}