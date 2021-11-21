import CrawlerBase from './core/CrawlerBase';

export default async function echo<T=any>(data : T, err: any = undefined) {
  const cb = new CrawlerBase();
  return cb.run();
}
