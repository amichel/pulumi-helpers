export function shallowMerge(source: any, dest: any): any {
    return Object.assign(dest, source);
}