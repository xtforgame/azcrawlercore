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

export function fulfillablePromise<T = any>(expiryTime = 2000) {
  let callback: ((data: T) => any) | null;
  const fulfill = (data: T) => {
    if (callback) {
      callback(data);
      callback = null;
    }
  }
  const createPromise = () => new Promise((res) => {
    const i = setTimeout(() => {
      if (callback) {
        callback = null;
        res(null);
      }
    }, expiryTime);
    callback = (d) => {
      res(d);
      callback = null;
      clearTimeout(i);
    }
  });
  return {
    fulfill,
    createPromise,
  };
}

export function saveCode(data: any, jsonOnly = false) {
  fs.mkdirSync(`../kanebo/json`, { recursive: true });
  if (data?.name) {
    if (!jsonOnly) {
      fs.writeFileSync(`../kanebo/${data.name}`, data.content, { encoding: 'utf-8' });
    }
    fs.writeFileSync(`../kanebo/json/${data.name}.json`, JSON.stringify(data, null, 2), { encoding: 'utf-8' });
  }
}

export const scanAndSyncCodes = async (page: puppeteer.Page) => {
  const {
    fulfill,
    createPromise,
  } = fulfillablePromise();
  page.on('response', async (resp) => {
    const url = resp.url();
    console.log('url :', url);
    if (url.includes('layout_components')) {
      const data = await resp.json();
      fulfill(data);
    }
  });
  const $lis = await page.$$('.document-file');

  await promiseReduce(Array.from($lis), async (_, $li) => {
    await $li.click();
    const data: any = await createPromise();
    // console.log('data :', data);
    saveCode(data);
  }, null);
};

export const fetchCode = async (page: puppeteer.Page, id: string = '61c03bcd6f85ff13f9214320') => {
  let result: any = null;
  const cb = async (resp) => {
    const url = resp.url();
    console.log('url :', url);
    if (url.includes('layout_components')) {
      result = await resp.json();
    }
    page.off('response', cb);
  };
  page.on('response', cb);
  await page.evaluate(async () => {
    console.log('test');
    let token = document.querySelector('meta[name="csrf-token"]')!.getAttribute('content')!;
    let fetchCodeFunc = async () => {
      await fetch(
        `https://admin.shoplineapp.com/api/admin/v1/61a6fdf071c22a002eb8ca87/layout_components/${id}?`, {
        "headers": {
          "accept": "application/json, text/plain, */*",
          "accept-language": "zh-TW,zh;q=0.9",
          "cache-control": "no-cache",
          "pragma": "no-cache",
          "sec-ch-ua": "\"Google Chrome\";v=\"123\", \"Not:A-Brand\";v=\"8\", \"Chromium\";v=\"123\"",
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": "\"macOS\"",
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "x-csrf-token": token,
          "x-requested-with": "XMLHttpRequest"
        },
        "referrer": "https://admin.shoplineapp.com/admin/kanebo/themes/layouts",
        "referrerPolicy": "strict-origin-when-cross-origin",
        "body": null,
        "method": "GET",
        "mode": "cors",
        "credentials": "include"
      });
    };
    
  });
};

export const xxxx2 = async (page: puppeteer.Page) => {

};
