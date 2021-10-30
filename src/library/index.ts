import utils from './utils';

export default function echo<T=any>(data : T, err: any = undefined) {
  return new Promise((resolve : (value: T) => void, reject) => {
    if (err) {
      return reject(err);
    }
    return resolve(utils(data));
  });
}
