import mysql from 'mysql';
import axios from 'axios';
import { v4 } from 'uuid';
import fs from 'fs';
import { promiseReduce, toMap, promiseWait } from '../utils';
import Crawler from './Crawler';


export default class StockLabelManager {
  crawler: Crawler;

  constructor () {
    this.crawler = new Crawler();
  }

  async run() {
    return this.crawler.fetch();
  }
}
