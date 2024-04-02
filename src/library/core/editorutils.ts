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
  const createPromise = () => new Promise<T | null>((res) => {
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

export type CodePage = {
  id: string;
  type: string;
  name: string;
  template_key: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  current_version: string;
  has_draft: boolean;
  content: string;
  tags: {
    migratable: boolean;
    theme_key?: string;
    commit_id?: string;
  }
}

export function saveCodePage(data: CodePage, jsonOnly = false) {
  fs.mkdirSync(`../kanebo/json`, { recursive: true });
  if (data?.name) {
    if (!jsonOnly) {
      fs.writeFileSync(`../kanebo/${data.name}`, data.content, { encoding: 'utf-8' });
    }
    fs.writeFileSync(`../kanebo/json/${data.name}.json`, JSON.stringify(data, null, 2), { encoding: 'utf-8' });
  }
}

export function loadCodePage(pageName: string): CodePage | null {
  try {
    return JSON.parse(fs.readFileSync(`../kanebo/json/${pageName}.json`, { encoding: 'utf-8' }));
  } catch (error) {
    
  }
  return null;
}

export function loadCodePageContent(pageName: string): string | null {
  try {
    return fs.readFileSync(`../kanebo/${pageName}`, { encoding: 'utf-8' });
  } catch (error) {
    
  }
  return null;
}

export function listCodePages() {
  const files = fs.readdirSync(`../kanebo/json`);
  return files.map(fileName => fileName.substring(0, fileName.length - '.json'.length));
}


export const scanAndSyncCodePages = async (page: puppeteer.Page, filter: ($li: puppeteer.ElementHandle<Element>, name: string) => Promise<boolean> = async () => true) => {
  const {
    fulfill,
    createPromise,
  } = fulfillablePromise<CodePage>();
  page.on('response', async (resp) => {
    const url = resp.url();
    if (url.includes('layout_components')) {
      console.log('url :', url);
      const data = await resp.json();
      fulfill(data);
    }
  });
  const $lis = await page.$$('.document-file');
  const liNames = await page.$$eval('.document-file', ($lis) => {
    return Array.from($lis).map(e => (e.textContent || '').trim());
  });

  await promiseReduce(Array.from($lis), async (_, $li, i) => {
    const skip = !(await filter($li, liNames[i]));
    if (skip) {
      return;
    }
    await $li.click();
    const data = await createPromise();
    // console.log('data :', data);
    saveCodePage(data!);
  }, null);
};

export const fetchCodePageById = async (page: puppeteer.Page, id: string) => {
  const json = await page.evaluate(async (id) => {
    console.log('test');
    let azslToken = document.querySelector('meta[name="csrf-token"]')!.getAttribute('content')!;
    const res = await fetch(
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
        "x-csrf-token": azslToken,
        "x-requested-with": "XMLHttpRequest"
      },
      "referrer": "https://admin.shoplineapp.com/admin/kanebo/themes/layouts",
      "referrerPolicy": "strict-origin-when-cross-origin",
      "body": null,
      "method": "GET",
      "mode": "cors",
      "credentials": "include"
    });
    return res.json();
  }, id);
  return json;
};

export const fetchCodePage = async (page: puppeteer.Page, pageName: string) => {
  const codePage = loadCodePage(pageName)!;
  return fetchCodePageById(page, codePage.id);
};

export const putCode = async (page: puppeteer.Page, content: string, codePage: CodePage) => {
  await page.evaluate(async (codePage) => {
    let azslToken = document.querySelector('meta[name="csrf-token"]')!.getAttribute('content')!;
    try {
      await fetch(
        `https://admin.shoplineapp.com/api/admin/v1/61a6fdf071c22a002eb8ca87/layout_components/${codePage.id}`,
        {
          "headers": {
            "accept": "application/json, text/plain, */*",
            "accept-language": "zh-TW,zh;q=0.9",
            "cache-control": "no-cache",
            "content-type": "application/json;charset=UTF-8",
            "pragma": "no-cache",
            "sec-ch-ua": "\"Google Chrome\";v=\"123\", \"Not:A-Brand\";v=\"8\", \"Chromium\";v=\"123\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"macOS\"",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "x-csrf-token": azslToken,
            "x-requested-with": "XMLHttpRequest"
          },
          "referrer": "https://admin.shoplineapp.com/admin/kanebo/themes/layouts",
          "referrerPolicy": "strict-origin-when-cross-origin",
          "body": JSON.stringify(codePage),
          "method": "PUT",
          "mode": "cors",
          "credentials": "include"
        }
      );
    } catch (error) {
      console.log('codePage :', codePage);
      console.log('error :', error);
    }
  }, {
    ...codePage,
    content,
  });
};

export const publishCode = async (page: puppeteer.Page, codePage: CodePage) => {
  await page.evaluate(async (codePage) => {
    let azslToken = document.querySelector('meta[name="csrf-token"]')!.getAttribute('content')!;
    try {
      await fetch(
        `https://admin.shoplineapp.com/api/admin/v1/61a6fdf071c22a002eb8ca87/layout_components/${codePage.id}/publish_draft`,
        {
          "headers": {
            "accept": "application/json, text/plain, */*",
            "accept-language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
            "sec-ch-ua": "\" Not A;Brand\";v=\"99\", \"Chromium\";v=\"92\"",
            "sec-ch-ua-mobile": "?0",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "x-csrf-token": azslToken,
            "x-requested-with": "XMLHttpRequest"
          },
          "referrer": "https://admin.shoplineapp.com/admin/kanebo/themes/layouts",
          "referrerPolicy": "strict-origin-when-cross-origin",
          "body": null,
          "method": "PUT",
          "mode": "cors",
          "credentials": "include"
        }
      );
    } catch (error) {
      console.log('codePage :', codePage);
      console.log('error :', error);
    }
  }, codePage);
};

export const updateCode = async (page: puppeteer.Page, pageName: string) => {
  const codePage = await fetchCodePage(page, pageName);
  saveCodePage(codePage!, true);
  const codeContent = loadCodePageContent(pageName);
  await putCode(page, codeContent!, codePage!);
  await publishCode(page, codePage!);
};

export type UpdateOptions = {
  list: string[];
  finished: boolean;
  done: boolean;
}

export function loadUpdateJson(): UpdateOptions | null | true {
  try {
    let data = fs.readFileSync(`../kanebo/misc/update.json`, { encoding: 'utf-8' })
    const json: UpdateOptions = JSON.parse(data);
    let shouldWrite = false;
    if (!json.done) {
      shouldWrite = true;
      data = data.replace('"done": false', '"done": true');
    }
    if (json.finished) {
      shouldWrite = true;
      data = data.replace('"finished": true', '"finished": false');
    }
    if (shouldWrite) {
      fs.writeFileSync(`../kanebo/misc/update.json`, data, { encoding: 'utf-8' })
    }
    if (json.finished) {
      return json.finished;
    }
    return json;
  } catch (error) {
    
  }
  return null;
}

let lastRefresh = 0;

export const updateCodeFromJson = async (page: puppeteer.Page) => {
  await promiseWaitFor(2000, async () => {
    const result = await loadUpdateJson();
    if (result === true || result === null) {
      return !!result;
    }
    if (!result.done) {
      if (new Date().getTime() - 30 * 60 * 1000 > lastRefresh) {
        lastRefresh = new Date().getTime();
        await page.reload({ waitUntil: 'networkidle2' });
      }
      await promiseReduce(result.list.filter(fileName => fileName && !fileName.startsWith('//')), async(_, fileName) => {
        await updateCode(page, fileName);
      }, null);
      console.log('updateed !!!!');
    }
    return false;
  });
};
