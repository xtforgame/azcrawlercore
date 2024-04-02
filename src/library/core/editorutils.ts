/* eslint-disable no-return-assign, no-param-reassign */
import fs from 'fs';
import path from 'path';
import moment from 'moment';
import { google, drive_v3, gmail_v1 } from 'googleapis';
import puppeteer, { launch, Browser } from 'puppeteer';
import useProxy from 'puppeteer-page-proxy';
import readline from 'readline';
import XLSX from 'xlsx';
import { Readable } from 'stream';
import { promiseReduce, promiseWait, promiseWaitFor } from '~/utils';
import GoogleOAuth2Client from '~/utils/GoogleOAuth2Client';
import GoogleDriveManager from '~/utils/GoogleDriveManager';

export const syncCodes = async (page: puppeteer.Page) => {
  const $lis = await page.$$('.document-file');

  await promiseReduce(Array.from($lis), async (_, $li) => {
    await $li.click();
    const data: any = await new Promise((res) => {
      const i = setTimeout(() => {
        if (callback) {
          callback = null;
          res(null);
        }
      }, 2000);
      callback = (d) => {
        res(d);
        callback = null;
        clearTimeout(i);
      }
    });
    // console.log('data :', data);
    fs.mkdirSync(`../kanebo/json`, { recursive: true });
    if (data?.name) {
      fs.writeFileSync(`../kanebo/${data.name}`, data.content, { encoding: 'utf-8' });
      fs.writeFileSync(`../kanebo/json/${data.name}.json`, JSON.stringify(data, null, 2), { encoding: 'utf-8' });
    }
  }, null);
};

export const xxxx2 = async (page: puppeteer.Page) => {

};
