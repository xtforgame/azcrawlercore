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
import { scanAndSyncCodePages, updateCodeFromJson, updateCode, fetchCodePage, listCodePages, loadCodePage, saveCodePage } from '~/core/editorutils';
import GoogleOAuth2Client from '~/utils/GoogleOAuth2Client';
import ShoplineCrawlerBase from './ShoplineCrawlerBase';

export type PuppeteerLaunchOptions = Parameters<typeof launch>[0];

function bufferToStream(buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  return stream;
}

export default class CrawlerBase extends ShoplineCrawlerBase {
  async createDriveApi(tokenName: string) {
    const clientSecrets : any = await this.loadJsonFile(path.join('secrets', 'googleapp_client_secrets.json'));
    const goa2c = new GoogleOAuth2Client(
      'calendarManager',
      {
        scopes: [
          'https://www.googleapis.com/auth/gmail.modify',
          'https://www.googleapis.com/auth/gmail.compose',
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/calendar.readonly',
          'https://www.googleapis.com/auth/calendar.events',
          'https://www.googleapis.com/auth/drive.file',
        ],
        clientSecrets: clientSecrets.web,
      }
    );
    const tokens = await this.loadJsonFile(path.join('secrets', tokenName));
    goa2c.authorize(tokens);
    return google.drive({ version: 'v3', auth: goa2c.oAuth2Client });
  }

  async init() {
    this.gmailApis = await Promise.all([
      await this.createGmailApi('googleapp_tokens-xt.json'),
      await this.createGmailApi('googleapp_tokens-bsd.json'),
      // await this.createDriveApi('googleapp_tokens-c2.json'),
    ]);
    this.driveApis = await Promise.all([
      await this.createDriveApi('googleapp_tokens-r.json'),
      await this.createDriveApi('googleapp_tokens-c1.json'),
      // await this.createDriveApi('googleapp_tokens-c2.json'),
    ]);
  }

  getWb(json) {
    const rowsToDownload0 = json.filter(r => r['付款狀態'] === '已付款');
    console.log('rowsToDownload0 :', rowsToDownload0);
    const rowsToDownloadX: any[] = [];
    rowsToDownload0.forEach((r, i, arr) => {
      if (!r['商品貨號']) {
        return;
      }
      if (r['商品貨號'].indexOf('\n') >= 0) {
        const ids = r['商品貨號'].split('\n');
        let totalOriginalPrice = parseInt(r['商品原價']);
        let totalFinalPrice = parseInt(r['商品結帳價']);
        
        const eachOriginalPrice = Math.floor(totalOriginalPrice / ids.length);
        const eachFinalPrice = Math.floor(totalFinalPrice / ids.length);
        
        ids.forEach((id, i) => {
          const originalPrice = i !== ids.length -1 ? eachOriginalPrice : totalOriginalPrice;
          const finalPrice = i !== ids.length -1 ? eachFinalPrice : totalFinalPrice;
          if (i) {
            rowsToDownloadX.push({
              ...r,
              '商品貨號': id,
              '商品原價': originalPrice,
              '商品結帳價': finalPrice,
              '付款總金額': '',
              '訂單小計': '',
              '訂單合計': '',
              '運費': '',
              '附加費': '',
              '優惠折扣': '',
              '自訂折扣合計': '',
              '折抵購物金': '',
              '兌換贈品點數': '',
            });
          } else {
            rowsToDownloadX.push({
              ...r,
              '商品貨號': id,
              '商品原價': originalPrice,
              '商品結帳價': finalPrice,
            });
          }
          totalOriginalPrice -= originalPrice;
          totalFinalPrice -= finalPrice;
        });
      } else {
        rowsToDownloadX.push(r);
      }
    });

    const rowsToDownload: any[] = [];
    let pendingRow: any = null;
    let discountBaseRow: any = null;
    rowsToDownloadX.forEach((r, i, arr) => {
      if (pendingRow && pendingRow['訂單號碼'] !== r['訂單號碼']) {
        rowsToDownload.push(pendingRow);
        pendingRow = null;
      }
      if (discountBaseRow && discountBaseRow['訂單號碼'] !== r['訂單號碼']) {
        discountBaseRow = null;
      }
      const total = parseInt(r['付款總金額']);
      if (total > 0) {
        discountBaseRow = {
          ...r,
          '總折抵': parseInt(r['優惠折扣']) + parseInt(r['自訂折扣合計']) + parseInt(r['折抵購物金']) + parseInt(r['點數折現']) + parseInt(r['折現用點數']),
        };
        if (discountBaseRow['總折抵'] <= 0) {
          discountBaseRow = null;
        } else {
          let index = i
          let invalidCounter = 0;
          let lastIndex = 0;
          for (; index < arr.length; index++) {
            const element = arr[index];
            if (discountBaseRow!['訂單號碼'] !== element['訂單號碼']) {
              break;
            }
            if (parseInt(element['商品原價']) > 0) {
              lastIndex = index;
            } else {
              invalidCounter++;
            }
          }
          console.log('total :', discountBaseRow['總折抵']);
          const divider = index - i - invalidCounter;
          discountBaseRow.divider = divider;
          discountBaseRow.lastIndex = lastIndex;
          console.log('divider :', divider);
          console.log('lastIndex :', lastIndex);
          discountBaseRow['平均折抵'] = Math.floor(discountBaseRow['總折抵']/divider);
        }
      }
      const shippingFee = parseInt(r['運費']);
      if (shippingFee > 0) {
        pendingRow = {
          ...r,
          '數量': 1,
          '商品名稱': '運費',
          '商品貨號': 'ADD-L',
          '商品原價': shippingFee,
          '商品結帳價': shippingFee,
        };
      }
      if (
        discountBaseRow
        && discountBaseRow['訂單號碼'] === r['訂單號碼']
        && parseInt(r['商品原價']) > 0
      ) {
        if (i !== discountBaseRow.lastIndex) {
          r['商品原價'] = parseInt(r['商品原價']) - (discountBaseRow['平均折抵'] / parseInt(r['數量']));
          r['商品結帳價'] = parseInt(r['商品結帳價']) - (discountBaseRow['平均折抵'] / parseInt(r['數量']));
          discountBaseRow['總折抵'] -= discountBaseRow['平均折抵']
        } else {
          r['商品原價'] = parseInt(r['商品原價']) - (discountBaseRow['總折抵'] / parseInt(r['數量']));
          r['商品結帳價'] = parseInt(r['商品結帳價']) - (discountBaseRow['總折抵'] / parseInt(r['數量']));
          discountBaseRow['總折抵'] = 0;
        }
      }
      rowsToDownload.push(r);
    });
    if (pendingRow) {
      rowsToDownload.push(pendingRow);
      pendingRow = null;
    }
    const h = [
      '訂單號碼',
      '送貨方式',
      '送貨狀態',
      '收件人',
      '收件人電話號碼',
      '地址 1',
      '城市',
      '地區/州/省份',
      '國家／地區',
      '郵政編號（如適用)',
      '商品名稱',
      '商品原價',
      '商品結帳價',
      '結帳價類型',
      '數量',
      '商品類型',
      '訂單來源',
      '訂單日期',
      '訂單狀態',
      '預購訂單',
      '付款方式',
      '付款狀態',
      '貨幣',
      '付款訂單號碼',
      '付款總金額',
      '已退款金額',
      '訂單小計',
      '運費',
      '附加費',
      '優惠折扣',
      '自訂折扣合計',
      '折抵購物金',
      '點數折現',
      '折現用點數',
      '訂單合計',
      '稅費',
      '完整地址',
      '串接物流貨態',
      '訂單明細上次列印時間',
      '商品成本',
      '預購商品',
      '顧客 ID',
      '顧客',
      '電郵',
      '電話號碼',
      '會員',
      '會員註冊日期',
      '會員註冊來源',
      '兌換贈品點數',
    ];
    // const header = h.map(hh => (
    //   { title: hh, get: (row, i) => row[hh] }
    // ));

    const header = [
      { title: '客戶代號', get: (row, i) => 'FG0003' },
      { title: '專案代號', get: (row, i) => 'I' },
      { title: '會員編號', get: (row, i) => row['顧客 ID'] },
      { title: '會員姓名', get: (row, i) => row['顧客'] },
      { title: '品號', get: (row, i) => row['商品貨號']  }, // 商品名稱
      { title: '訂單數量', get: (row, i) => row['數量'] },
      { title: '單價', get: (row, i) => row['結帳價類型'] === '原價' ? row['商品原價'] : row['商品結帳價'] },
      { title: '發票號碼', get: (row, i) => row['發票號碼'] },
      { title: '訂單編號', get: (row, i) => (row['訂單號碼'] || '').replace('#', '') },
      { title: '備註', get: (row, i) => row['出貨備註'] },
      { title: '收件人', get: (row, i) => row['收件人'] },
      { title: '聯絡電話(一)', get: (row, i) => row['電話號碼'] },
      { title: '聯絡電話(二)', get: (row, i) => row['收件人電話號碼'] },
      { title: '送貨地址(一)', get: (row, i) => (row['完整地址'] || '').replace(/\s/gm, '') }, // `${row['國家／地區']} ${row['地區/州/省份']} ${row['城市']} ${row['郵政編號（如適用)']} ${row['地址 1']}` },
      { title: '送貨地址(二)', get: (row, i) => '' }, // row['地址 2'] },
      { title: '註冊email', get: (row, i) => row['電郵'] },
      { title: '註冊電話', get: (row, i) => row['電話號碼'] },
      { title: '送貨編號', get: (row, i) => row['送貨編號'] },
    ];
    // [
    //   { title: '訂單編號', get: (row, i) => i },
    //   { title: '專案代號', get: (row, i) => 'XXX' },
    //   { title: '會員編號', get: (row, i) => 'XXX' },
    // ];
    // const transform = (row, i) => header.reduce((m, h) => ({ ...m, [h.title]: h.get(row, i) }), {});
    // const transform2 = (h, i) => [h.title, ...rowsToDownload.map((row) => h.get(row, i))];
    // const wb = XLSX.utils.book_new();
    // const ws = XLSX.utils.aoa_to_sheet(header.map(transform2));
    // // const ws = XLSX.utils.json_to_sheet(rowsToDownload.map(transform), { header: header.map(h => h.title) });
    // const wscols = header.map(h => ({ wch: 20 }));
    // ws['!cols'] = wscols;

    const transform = (row, i) => header.reduce((m, h) => ({ ...m, [h.title]: h.get(row, i) }), {});
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rowsToDownload.map(transform), { header: header.map(h => h.title) });
    const wscols = header.map(h => ({ wch: 20 }));
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, '訂單');
    return wb;
  }

  async cleanFolder(driveApi: drive_v3.Drive) {
    const { data: { files } } = await driveApi.files.list({
      pageSize: 1000,
      fields: 'nextPageToken, files(id, name, createdTime)',
      orderBy: 'createdTime'
    });
    const folder = files?.find(f => f.name === 'ShoplineReports');
    if (files) {
      await promiseReduce(files, async (_, f) => {
        if (f.id === folder?.id) {
          return;
        }
        try {
          let res = await driveApi.files.delete({ 'fileId': f.id as any });
          console.log('res :', res);
        } catch (error) {
          console.log('error :', error);
        }
      }, null)
    }
  }

  async findFolder(driveApi: drive_v3.Drive) {
    const { data: { files } } = await driveApi.files.list({
      pageSize: 1000,
      fields: 'nextPageToken, files(id, name, createdTime)',
      orderBy: 'createdTime'
    });
    console.log('files :', files);
    return files?.find(f => f.name === 'ShoplineReports');
  }

  async debugPrint(driveApi: drive_v3.Drive, stream, date) {
    const folder = await this.findFolder(driveApi);
    let folderId = folder?.id;
    if (!folderId) {
      try {
        const fileMetadata = {
          name: 'ShoplineReports',
          mimeType: 'application/vnd.google-apps.folder',
        };
        const res = await driveApi.files.create({
          requestBody: fileMetadata,
          fields: 'id',
        });
        folderId = res.data.id;
      } catch (error) {
      }
    }

    const fileName = 'package.json';
    const fileSize = fs.statSync(fileName).size;
    const fileMetadata = {
      name: `${date.format('YYYY-MM-DD')}.xlsx`,
      originalFilename: fileName,
      parents: [folderId],
      // mimeType: 'application/vnd.google-apps.spreadsheet',
    };
    const res = await driveApi.files.create(
      {
        requestBody: fileMetadata,
        media: {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // Modified
          body: stream,
          // body: fs.createReadStream(fileName),
        },
      },
      {
        // Use the `onUploadProgress` event from Axios to track the
        // number of bytes uploaded to this point.
        onUploadProgress: (evt) => {
          const progress = (evt.bytesRead / fileSize) * 100;
          readline.clearLine(process.stdout, 0);
          readline.cursorTo(process.stdout, 0);
          process.stdout.write(`${Math.round(progress)}% complete`);
        },
      }
    );
    console.log(res.data);
    // return files;
  }


  generateReport = async (page: puppeteer.Page, date: moment.Moment) => {
    await page.evaluate(async (dateStringFrom, dateStringTo) => {
      let azslToken = document.querySelector('meta[name="csrf-token"]')!.getAttribute('content')!;
      try {
        await fetch("https://admin.shoplineapp.com/api/admin/v2/614ae3db97e6f100235c99ff/orders/export_sales?locale=zh-hant", {
          "headers": {
            "accept": "application/json, text/plain, */*",
            "accept-language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
            "content-type": "application/json;charset=UTF-8",
            "sec-ch-ua": "\" Not A;Brand\";v=\"99\", \"Chromium\";v=\"92\"",
            "sec-ch-ua-mobile": "?0",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "x-csrf-token": azslToken,
            "x-requested-with": "XMLHttpRequest"
          },
          "referrer": "https://admin.shoplineapp.com/admin/addictionbeauty/orders?createdBy=admin",
          "referrerPolicy": "strict-origin-when-cross-origin",
          "body": JSON.stringify({
            "performer_id": "5ec7197f48b68e0048f193be",
            "type": "by_row",
            "date": "range",
            "filters": {
                "createdBy": "admin",
                "start_date": dateStringFrom,
                "end_date": dateStringTo,
                "selected_filter_option": "created_at"
            },
            "order_ids": [],
            "fields": [
                {
                    "name": "order_number",
                    "type": "order",
                    "typeIndex": 0
                },
                {
                    "name": "delivery.option",
                    "type": "delivery",
                    "typeIndex": 0
                },
                {
                    "name": "delivery.status",
                    "type": "delivery",
                    "typeIndex": 1
                },
                {
                    "name": "delivery_data.recipient_name",
                    "type": "delivery",
                    "typeIndex": 2
                },
                {
                    "name": "delivery_data.recipient_phone",
                    "type": "delivery",
                    "typeIndex": 3
                },
                {
                    "name": "delivery_address.address_1",
                    "type": "delivery",
                    "typeIndex": 4
                },
                {
                    "name": "delivery_address.address_2",
                    "type": "delivery",
                    "typeIndex": 5
                },
                {
                    "name": "delivery_address.city",
                    "type": "delivery",
                    "typeIndex": 6
                },
                {
                    "name": "delivery_address.state",
                    "type": "delivery",
                    "typeIndex": 7
                },
                {
                    "name": "delivery_address.country",
                    "type": "delivery",
                    "typeIndex": 8
                },
                {
                    "name": "delivery_address.postcode",
                    "type": "delivery",
                    "typeIndex": 9
                },
                {
                    "name": "comments",
                    "type": "delivery",
                    "typeIndex": 11
                },
                {
                    "name": "delivery_data.location_name",
                    "type": "delivery",
                    "typeIndex": 13
                },
                {
                    "name": "invoice_request.tax_id",
                    "type": "invoice",
                    "typeIndex": 0
                },
                {
                    "name": "invoice_request.mailing_address",
                    "type": "invoice",
                    "typeIndex": 1
                },
                {
                    "name": "sku",
                    "type": "product",
                    "typeIndex": 0
                },
                {
                    "name": "title",
                    "type": "product",
                    "typeIndex": 1
                },
                {
                    "name": "variation",
                    "type": "product",
                    "typeIndex": 2
                },
                {
                    "name": "product_price",
                    "type": "product",
                    "typeIndex": 4
                },
                {
                    "name": "checkout_price",
                    "type": "product",
                    "typeIndex": 5
                },
                {
                    "name": "price_type",
                    "type": "product",
                    "typeIndex": 6
                },
                {
                    "name": "quantity",
                    "type": "product",
                    "typeIndex": 8
                },
                {
                    "name": "item_type",
                    "type": "product",
                    "typeIndex": 9
                },
                {
                    "name": "parent_order_number",
                    "type": "order",
                    "typeIndex": 1
                },
                {
                    "name": "fb_page_name",
                    "type": "order",
                    "typeIndex": 5
                },
                {
                    "name": "live_stream_name",
                    "type": "order",
                    "typeIndex": 6
                },
                {
                    "name": "created_by",
                    "type": "order",
                    "typeIndex": 7
                },
                {
                    "name": "created_at",
                    "type": "order",
                    "typeIndex": 9
                },
                {
                    "name": "status",
                    "type": "order",
                    "typeIndex": 10
                },
                {
                    "name": "preorder",
                    "type": "order",
                    "typeIndex": 11
                },
                {
                    "name": "payment.option",
                    "type": "order",
                    "typeIndex": 12
                },
                {
                    "name": "payment.paid_at",
                    "type": "order",
                    "typeIndex": 13
                },
                {
                    "name": "payment.status",
                    "type": "order",
                    "typeIndex": 14
                },
                {
                    "name": "payment.currency",
                    "type": "order",
                    "typeIndex": 15
                },
                {
                    "name": "payment.from",
                    "type": "order",
                    "typeIndex": 16
                },
                {
                    "name": "payment.amount",
                    "type": "order",
                    "typeIndex": 17
                },
                {
                    "name": "payment.refund_amount",
                    "type": "order",
                    "typeIndex": 18
                },
                {
                    "name": "subtotal",
                    "type": "order",
                    "typeIndex": 19
                },
                {
                    "name": "delivery.fee",
                    "type": "order",
                    "typeIndex": 20
                },
                {
                    "name": "payment.fee",
                    "type": "order",
                    "typeIndex": 21
                },
                {
                    "name": "discount",
                    "type": "order",
                    "typeIndex": 22
                },
                {
                    "name": "custom_discount",
                    "type": "order",
                    "typeIndex": 23
                },
                {
                    "name": "user_credit",
                    "type": "order",
                    "typeIndex": 24
                },
                {
                    "name": "point_discount",
                    "type": "order",
                    "typeIndex": 25
                },
                {
                    "name": "applied_points",
                    "type": "order",
                    "typeIndex": 26
                },
                {
                    "name": "total",
                    "type": "order",
                    "typeIndex": 28
                },
                {
                    "name": "order_tags",
                    "type": "order",
                    "typeIndex": 29
                },
                {
                    "name": "order_remarks",
                    "type": "order",
                    "typeIndex": 30
                },
                {
                    "name": "cancelled_reason",
                    "type": "order",
                    "typeIndex": 31
                },
                {
                    "name": "payment.txn_id",
                    "type": "order",
                    "typeIndex": 32
                },
                {
                    "name": "edited_at",
                    "type": "order",
                    "typeIndex": 33
                },
                {
                    "name": "return_order.return_order_number",
                    "type": "order",
                    "typeIndex": 34
                },
                {
                    "name": "return_order.return_tracking_number",
                    "type": "order",
                    "typeIndex": 35
                },
                {
                    "name": "tax_fee",
                    "type": "order",
                    "typeIndex": 36
                },
                {
                    "name": "affiliate.partner",
                    "type": "order",
                    "typeIndex": 40
                },
                {
                    "name": "自訂訂單欄位 1 (店主備註)",
                    "field_id": null,
                    "field_idx": 0,
                    "type": "order",
                    "typeIndex": 41
                },
                {
                    "name": "自訂訂單欄位 2 (店主備註)",
                    "field_id": null,
                    "field_idx": 1,
                    "type": "order",
                    "typeIndex": 42
                },
                {
                    "name": "自訂訂單欄位 3",
                    "field_id": "",
                    "field_idx": 2,
                    "type": "order",
                    "typeIndex": 43
                },
                {
                    "name": "自訂訂單欄位 4",
                    "field_id": "",
                    "field_idx": 3,
                    "type": "order",
                    "typeIndex": 44
                },
                {
                    "name": "自訂訂單欄位 5",
                    "field_id": "",
                    "field_idx": 4,
                    "type": "order",
                    "typeIndex": 45
                },
                {
                    "name": "product_subscription.recurring_count",
                    "type": "product_subscription",
                    "typeIndex": 0
                },
                {
                    "name": "product_subscription.next_subscription_date",
                    "type": "product_subscription",
                    "typeIndex": 1
                },
                {
                    "name": "product_subscription.code",
                    "type": "product_subscription",
                    "typeIndex": 2
                },
                {
                    "name": "delivery_address.full_address",
                    "type": "delivery",
                    "typeIndex": 10
                },
                {
                    "name": "delivery.remarks",
                    "type": "delivery",
                    "typeIndex": 12
                },
                {
                    "name": "delivery.delivery_status",
                    "type": "delivery",
                    "typeIndex": 14
                },
                {
                    "name": "delivery_data.tracking_number",
                    "type": "delivery",
                    "typeIndex": 15
                },
                {
                    "name": "delivery_data.location_code",
                    "type": "delivery",
                    "typeIndex": 16
                },
                {
                    "name": "delivery_data.time_slot",
                    "type": "delivery",
                    "typeIndex": 17
                },
                {
                    "name": "delivery_data.scheduled_delivery_date",
                    "type": "delivery",
                    "typeIndex": 18
                },
                {
                    "name": "stock_picking_last_exported_at",
                    "type": "delivery",
                    "typeIndex": 19
                },
                {
                    "name": "invoice_last_exported_at",
                    "type": "delivery",
                    "typeIndex": 20
                },
                {
                    "name": "label_last_printed_at",
                    "type": "delivery",
                    "typeIndex": 21
                },
                {
                    "name": "delivery.shipped_at",
                    "type": "delivery",
                    "typeIndex": 22
                },
                {
                    "name": "delivery.arrived_at",
                    "type": "delivery",
                    "typeIndex": 23
                },
                {
                    "name": "delivery.collected_at",
                    "type": "delivery",
                    "typeIndex": 24
                },
                {
                    "name": "delivery.returned_at",
                    "type": "delivery",
                    "typeIndex": 25
                },
                {
                    "name": "invoice_request.invoice_type",
                    "type": "invoice",
                    "typeIndex": 2
                },
                {
                    "name": "invoice_request.invoice_format",
                    "type": "invoice",
                    "typeIndex": 3
                },
                {
                    "name": "invoice_request.carrier_type",
                    "type": "invoice",
                    "typeIndex": 4
                },
                {
                    "name": "invoice_request.carrier_number",
                    "type": "invoice",
                    "typeIndex": 5
                },
                {
                    "name": "invoice_request.buyer_name",
                    "type": "invoice",
                    "typeIndex": 6
                },
                {
                    "name": "invoice_request.invoice_number",
                    "type": "invoice",
                    "typeIndex": 7
                },
                {
                    "name": "invoice_request.donation_unit",
                    "type": "invoice",
                    "typeIndex": 8
                },
                {
                    "name": "invoice_request.invoice_status",
                    "type": "invoice",
                    "typeIndex": 9
                },
                {
                    "name": "invoice_request.invoice_created_at",
                    "type": "invoice",
                    "typeIndex": 10
                },
                {
                    "name": "invoice_request.invoice_tax_type",
                    "type": "invoice",
                    "typeIndex": 11
                },
                {
                    "name": "invoice_request.invoice_cancelled_at",
                    "type": "invoice",
                    "typeIndex": 12
                },
                {
                    "name": "product_cost",
                    "type": "product",
                    "typeIndex": 3
                },
                {
                    "name": "is_preorder",
                    "type": "product",
                    "typeIndex": 10
                },
                {
                    "name": "preorder_note",
                    "type": "product",
                    "typeIndex": 11
                },
                {
                    "name": "addon_item_type",
                    "type": "product",
                    "typeIndex": 12
                },
                {
                    "name": "location_id",
                    "type": "product",
                    "typeIndex": 13
                },
                {
                    "name": "product_level_promotion",
                    "type": "product",
                    "typeIndex": 14
                },
                {
                    "name": "product_level_discount",
                    "type": "product",
                    "typeIndex": 15
                },
                {
                    "name": "order_level_promotion",
                    "type": "product",
                    "typeIndex": 16
                },
                {
                    "name": "order_level_discount",
                    "type": "product",
                    "typeIndex": 17
                },
                {
                    "name": "customer_id",
                    "type": "customer",
                    "typeIndex": 0
                },
                {
                    "name": "customer_name",
                    "type": "customer",
                    "typeIndex": 1
                },
                {
                    "name": "customer_email",
                    "type": "customer",
                    "typeIndex": 2
                },
                {
                    "name": "customer_phone",
                    "type": "customer",
                    "typeIndex": 3
                },
                {
                    "name": "customer_info.gender",
                    "type": "customer",
                    "typeIndex": 4
                },
                {
                    "name": "customer_info.birthday",
                    "type": "customer",
                    "typeIndex": 5
                },
                {
                    "name": "customer_registered",
                    "type": "customer",
                    "typeIndex": 6
                },
                {
                    "name": "customer_registered_at",
                    "type": "customer",
                    "typeIndex": 8
                },
                {
                    "name": "customer_registered_by",
                    "type": "customer",
                    "typeIndex": 9
                },
                {
                    "name": "utm_source",
                    "type": "marketing",
                    "typeIndex": 0
                },
                {
                    "name": "utm_medium",
                    "type": "marketing",
                    "typeIndex": 1
                },
                {
                    "name": "utm_source_and_utm_medium",
                    "type": "marketing",
                    "typeIndex": 2
                },
                {
                    "name": "utm_campaign",
                    "type": "marketing",
                    "typeIndex": 3
                },
                {
                    "name": "utm_term",
                    "type": "marketing",
                    "typeIndex": 4
                },
                {
                    "name": "utm_content",
                    "type": "marketing",
                    "typeIndex": 5
                },
                {
                    "name": "utm_time",
                    "type": "marketing",
                    "typeIndex": 6
                },
                {
                    "name": "customer_membership_tier",
                    "type": "customer",
                    "typeIndex": 7
                },
                {
                    "name": "customer_referrer.name",
                    "type": "customer",
                    "typeIndex": 12
                },
                {
                    "name": "customer_referrer.email",
                    "type": "customer",
                    "typeIndex": 13
                },
                {
                    "name": "customer_referrer.phone",
                    "type": "customer",
                    "typeIndex": 14
                },
                {
                    "name": "platform",
                    "type": "order",
                    "typeIndex": 4
                },
                {
                    "name": "redeemed_points",
                    "type": "order",
                    "typeIndex": 27
                },
                {
                    "name": "affiliate.campaign",
                    "type": "order",
                    "typeIndex": 37
                },
                {
                    "name": "affiliate.code",
                    "type": "order",
                    "typeIndex": 38
                },
                {
                    "name": "affiliate.reward",
                    "type": "order",
                    "typeIndex": 39
                },
                {
                    "name": "product_points",
                    "type": "product",
                    "typeIndex": 7
                },
                {
                    "name": "手機號碼",
                    "field_id": "619c7dc22d22f300388f34bf",
                    "type": "customer",
                    "typeIndex": 10
                },
                {
                    "name": "姓名",
                    "field_id": "61d6c8ec8cdf20439bbd05b6",
                    "type": "customer",
                    "typeIndex": 11
                },
                {
                    "name": "combined_to_order_number",
                    "type": "order",
                    "typeIndex": 2
                },
                {
                    "name": "combined_from_order_numbers",
                    "type": "order",
                    "typeIndex": 3
                },
                {
                    "name": "agent",
                    "type": "order",
                    "typeIndex": 8
                }
            ]
          }),
          "method": "POST",
          "mode": "cors",
          "credentials": "include"
        });
      } catch (error) {
        console.log('date :', date);
        console.log('error :', error);
      }
    }, date.toISOString(), moment(date).add(1, 'd').toISOString());
  };

  async runX(date) {
    const browser = await puppeteer.launch(this.getPuppeteerLaunchOptions(true));
    try {
      if (1 == 1) {
        const page = await this.newPage(browser);
        const session = await this.login(page);
        if (0) {
          // await promiseWait(5000);
          await page.goto('https://admin.shoplineapp.com/admin/addictionbeauty/orders?createdBy=admin', {
            waitUntil: 'networkidle2',
          });

          await promiseWait(2000);

          try {
            await page.click('.intercom-post-close');
            await promiseWait(2000);
          } catch (error) {
          }
          await promiseWait(1000);

          // await page.reload({ waitUntil: ["networkidle0", "domcontentloaded"] });
          await page.reload({ waitUntil: 'networkidle2' });
          await promiseWait(1000);

          await page.click('.btn.btn-primary.ng-binding.dropdown-toggle');
          await page.$$eval('li.export-item a.ng-binding', ($as) => {
            Array.from($as).forEach(($a) => {
              if ($a.innerHTML.includes('匯出訂單報表')) {
                $a.click();
              }
            });
          });
          await promiseWait(3000);
          await page.click('input[name=duringDates]');

          await promiseWait(1000);
          await page.type('input[name=duringDates] ~ div div:nth-child(1) div.date-picker-container.date-picker-v2.date input', date.format('YYYY/MM/DD'), {
            delay: 200,
          });
          // await page.type('input[name=duringDates] ~ div div:nth-child(2) div.date-picker-container.date-picker-v2.date input', '2021/04/12');
          // await page.$$eval('div.date-picker-container.date-picker-v2.date input', ($inputs) => {
          //   console.log('$inputs :', $inputs);
          //   Array.from($inputs).forEach(($input) => {
          //     $input.value = '2021/04/12';
          //   });
          // });

          const p = new Promise((resolve, reject) => {
            page.on('response', (resp) => {
              const url = resp.url();
              if (url.includes('export_sales')) {
                if (resp.status() === 200) {
                  resolve(resp.status());
                } else {
                  reject(resp.status());
                }
              }
            });
          });
          await page.click('.modal-footer.clearfix button.btn.btn-primary.ng-binding');
          await p;
        }


        await this.generateReport(page, date);

        await promiseWait(2000);

        let xlsUrl = '';
        let xlsFilname = '';
        browser.on('targetcreated', async function (target) {
          console.log(target.url());
          const url = target.url();
          if (url.includes('.xls')) {
            xlsUrl = url;
            xlsFilname = /[^\/]*\.xls/g.exec(xlsUrl)?.[0]!;
          }
        });

        console.log('await promiseWaitFor(2000');
        await promiseWaitFor(2000, async () => {
          console.log('await page.goto(');
          await page.goto('https://admin.shoplineapp.com/admin/addictionbeauty/jobs', {
            waitUntil: 'networkidle2',
          });

          try {
            await session.send('Page.setDownloadBehavior', {
              behavior: 'allow',
              downloadPath: __dirname,
            });
          } catch (error) {
            console.log('error :', error);
            throw error;
          }

          // page.on('download', (download: any) => {
          //   const downloadPath = `${__dirname}/${download.filename}`;
          //   download.save(downloadPath);
          // });

          await page.click('table.table.table-hover.ng-scope tr:nth-child(1) td div.btn.btn-default.ng-scope');
          return true;
        });
        console.log('const wait = () => {');
        
        const wait = () => {
          if (!xlsFilname) {
            return false;
          }
          try {
            if (fs.existsSync(path.resolve(__dirname, xlsFilname))) {
              const workbook = XLSX.readFile(path.resolve(__dirname, xlsFilname));
              const j = XLSX.utils.sheet_to_json(workbook.Sheets['Sales']);
              console.log('j :', j);
              return true;
            }
          } catch(err) {
            // console.error(err)
          }
          return false;
        }
      }
      let json = {};
      let filename = '';
      const waitV2 = () => {
        const files = fs.readdirSync(__dirname);
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file.includes('orders_') && file.includes('.xls') && !file.includes('.crdownload')) {
            const workbook = XLSX.readFile(path.resolve(__dirname, file));
            const j = XLSX.utils.sheet_to_json(workbook.Sheets['Sales']);
            // console.log('j :', j);
            json = j;
            filename = file;
            return true;
          }
        }
        return false;
      };
      await promiseWaitFor(100, waitV2);
      const wb = this.getWb(json);
      await promiseReduce(this.driveApis, async (_, driveApi) => {
        const resp = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
        const stream = bufferToStream(resp);
        await this.debugPrint(driveApi, stream, date);
      }, null);
      const resp = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
      fs.writeFileSync('xxx.xlsx', resp);
      console.log('path.resolve(__dirname, filename) :', path.resolve(__dirname, filename));
      fs.unlinkSync(path.resolve(__dirname, filename))
      console.log('done');
    } catch (error) {
      console.log('error :', error);
    }

    // await promiseWait(9999999);
    await browser.close();
  }

  async run() {
    await this.init();
    // await promiseReduce(this.driveApis, async (_, driveApi) => {
    //   await this.cleanFolder(driveApi);
    // }, null)
    await promiseReduce([
      // moment('2024-04-03'),
      // moment('2024-04-04'),
      // moment('2024-04-26'),
      // moment('2024-04-27'),
      // moment('2024-04-28'),
      // moment('2024-04-29'),
      // moment('2024-04-30'),
      // moment('2024-05-01'),
      // moment('2024-05-02'),
      // moment('2024-05-17'),
      // moment('2024-05-18'),
      // moment('2024-05-19'),
      // moment('2024-05-20'),
      // moment('2024-05-21'),
      // moment('2024-05-22'),
      // moment('2024-05-23'),
      // moment('2024-05-24'),
      // moment('2024-05-25'),
      // moment('2024-05-26'),
      // moment('2024-06-27'),
      // moment('2024-06-28'),
      // moment('2024-06-29'),
      // moment('2024-06-30'),
      // moment('2024-07-01'),
      // moment('2024-07-02'),
      // moment('2024-07-03'),
      // moment('2024-07-04'),
      // moment('2024-07-05'),
      // moment('2024-07-06'),
      // moment('2024-07-07'),
      // moment('2024-07-08'),
      // moment('2024-07-09'),
      // moment('2024-07-10'),
      // moment('2024-07-11'),
      // moment('2024-07-12'),
      // moment('2024-07-13'),
      // moment('2024-07-14'),
      // moment('2024-07-15'),
      // moment('2024-07-16'),
      // moment('2024-07-17'),
      // moment('2024-07-18'),
      // moment('2024-07-19'),
      // moment('2024-07-20'),
      // moment('2024-07-21'),
      // moment('2024-07-22'),
      // moment('2024-07-23'),
      // moment('2024-07-24'),
      // moment('2024-07-25'),
      // moment('2024-07-26'),
      // moment('2024-07-27'),
      // moment('2024-07-28'),
      // moment('2024-07-29'),
      // moment('2024-07-30'),
      // moment('2024-07-31'),
      // moment('2024-08-01'),
      // moment('2024-08-02'),
      // moment('2024-08-03'),
      // moment('2024-08-04'),
      // moment('2024-08-05'),
      // moment('2024-08-06'),
      moment('2024-08-07'),
    ], async (_, date) => {
      console.log('date :', date);
      await this.runX(date);
    }, null)
    return 1;
  }
}


/*
<div class="intercom-post intercom-1sjltw e1n022i41">
  <div class="intercom-authored-container intercom-bmayvi e1atr8tr0">
    <div class="intercom-dhtp42 e1atr8tr1">
      <div class="intercom-1dvc4lw e1atr8tr2">
        <div class="intercom-tn3177 evxuo3e0"><img
            src="https://static.intercomassets.com/avatars/4321073/square_128/20211207-31_MKT_Zoe_Kung-1649754370.jpg"
            alt="Zoe profile"></div>
      </div>
      <div class="intercom-12ax1hg e1a94o2o0">
        <div class="test-author-summary-name-from intercom-128u8a2 e1a94o2o2"><span
            class="test-author-summary-name intercom-7wsxl4 e1a94o2o3">Zoe</span><span
            class="test-author-summary-from-clause intercom-xwnla5 e1a94o2o4"> 來自 SHOPLINE</span></div>
      </div>
    </div><span class="intercom-post-close intercom-dq8spb e1n022i42" aria-label="關閉" role="button" tabindex="0"></span>
    <div class="intercom-scrollable intercom-vzpz6w e11hrsmw0" tabindex="0">
      <div tabindex="-1" class="intercom-1revms er4a1r20">
        <div class="intercom-block-image intercom-6dk463 et4vnr0"><a
            href="https://www.bigmarker.com/shoplineapp/7-28-LINE-OA"
            data-via="https://via.intercom.io/c?url=https%3A%2F%2Fwww.bigmarker.com%2Fshoplineapp%2F7-28-LINE-OA&amp;h=42617eec9d8f548a37ca502a7fd709ff99ee5547-ryx6jq53_4581706039982&amp;l=cf00696e28c704a5f31e9ca4c41dc1615cf59cae-16286127">
            <div class="align-center intercom-ohwg9z e1dfxu9z0"><img
                src="https://downloads.intercomcdn.com/i/o/542298712/cbecda9673449864c6c931ba/0728+LINE+OA-banner.jpg"
                width="4000" height="2250" alt="" tabindex="0" class="intercom-1x0nbzk e1dfxu9z1" style=""></div>
          </a></div>
        <div class="intercom-block-paragraph e16pl8n50 intercom-1jkel8h"><b>SHOPLINE 攜手 LINE 官方Ｘ起士公爵</b></div>
        <h1 class="e1z0ml3b0 intercom-exfymg">透過 LINE 搶奪商機<br>帶你超前部署雙 11</h1>
        <div class="intercom-block-paragraph e16pl8n50 intercom-1wkrb3p">ADDICTION 網路旗艦店 您好：</div>
        <div class="intercom-block-paragraph e16pl8n50 intercom-1wkrb3p">每天必開 APP LINE &nbsp;成為你我生活不可或缺一部分。身為品牌主該如何善用
          LINE 官方帳號成為與顧客間的溝通橋樑？ 特邀<b>甜點專家起士公爵 James </b>以自身經驗分享從獲客到留客好友經營策略，以及 <b>LINE 官方 Jarro </b>分享 LINE 全通路思維，如何透過
          LINE 廣告借力使力<b><br><br></b>精彩內容千萬別錯過</div>
        <h2 class="e10zs45w0 intercom-h01nkq">&nbsp;🔶 講座簡介 🔶</h2>
        <div class="intercom-block-paragraph e16pl8n50 intercom-1wkrb3p">🗓 &nbsp;時間： 2022 / 7 / 28 (四) &nbsp;2-3
          pm<br>⛳️ &nbsp;地點：線上直播</div>
        <h2 class="e10zs45w0 intercom-h01nkq">&nbsp;🔶 &nbsp;精彩內容 &nbsp;🔶</h2>
        <ol class="intercom-1kcwmu e1bpfvzv0">
          <li class="intercom-es3ca">談觀念｜為什麼要經營 LINE 官方帳號？</li>
          <li class="intercom-es3ca">做實驗｜品牌各階段的操作精華與經營策略</li>
          <li class="intercom-es3ca">執行面｜剖析 LINE 的全通路行銷秘訣 - LINE 廣告、保證型版位</li>
          <li class="intercom-es3ca">享優惠｜SHOPLINE 獨家優惠大公開</li>
        </ol>
        <div class="intercom-block-button-container intercom-dlihp1 e1cfp3880"><a
            href="https://www.bigmarker.com/shoplineapp/7-28-LINE-OA"
            data-via="https://via.intercom.io/c?url=https%3A%2F%2Fwww.bigmarker.com%2Fshoplineapp%2F7-28-LINE-OA&amp;h=42617eec9d8f548a37ca502a7fd709ff99ee5547-ryx6jq53_4581706039982&amp;l=191c7b2f64c30090a772d86396c07219e2cfce2a-16286128"
            class="intercom-block-button intercom-1kt01ye e1cfp3881"><span class="intercom-es3ca">報名免費講座</span></a>
        </div>
        <div class="intercom-block-paragraph e16pl8n50 intercom-1wkrb3p"> </div>
        <div class="intercom-block-paragraph e16pl8n50 intercom-1wkrb3p">如對<b>課程</b>有任何疑問，歡迎您隨時回覆訊息！<br>或來信 <a
            href="mailto:ads-tw@shopplineapp.com" data-tracking-link-id="16286126" rel="nofollow noopener noreferrer"
            target="_blank">ads-tw@shoplineapp.com</a>，將有專人儘速與您聯繫，謝謝！</div>
        <div class="intercom-block-paragraph e16pl8n50 intercom-1wkrb3p"><br>SHOPLINE 行銷團隊</div>
      </div>
    </div>
    <div class="intercom-11gdw3w e1n022i43">
      <div class="intercom-post-composer intercom-lsqwrs e1n022i44" aria-label="開啟對話並回覆" role="button" tabindex="0">
        <span class="intercom-1baulvz e50zdj19">撰寫回覆</span></div>
    </div>
  </div>
</div>
*/