export default (data : any) : any => data;


export type ToPromiseFunction<T> = (_ : any, value : T, index : number, array : T[]) => any;


export function defaultToPromiseFunc<T>(_ : any, value : T, index : number, array : T[]) {
  return Promise.resolve(value);
}

export function toSeqPromise<T>(
  inArray : T[],
  toPrmiseFunc : ToPromiseFunction<T> = defaultToPromiseFunc,
) {
  return inArray.reduce((prev, curr, index, array) => prev.then(() => toPrmiseFunc(prev, curr, index, array)), Promise.resolve());
}

export function promiseReduce<T>(
  inArray : T[],
  toPrmiseFunc : ToPromiseFunction<T> = defaultToPromiseFunc,
  startValue: any,
) {
  return inArray.reduce((prev, curr, index, array) => prev.then(v => toPrmiseFunc(v, curr, index, array)), Promise.resolve(startValue));
}


export function toMap<T1, T2 = T1>(
  inArray : T1[],
  getId : (t: T1, i: number, array: T1[]) => any,
  trans : (t: T1, i: number, array: T1[]) => T2 = (t => <T2><any>t),
) {
  return inArray.reduce((prev, curr, index, array) => {
    prev[getId(curr, index, array)] = trans(curr, index, array);
    return prev;
  }, <{ [s: string]: T2 }>{});
}
