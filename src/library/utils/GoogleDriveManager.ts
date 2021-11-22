/* eslint-disable no-console, no-underscore-dangle */
import fs from 'fs';
import moment from 'moment';
import { google, drive_v3 } from 'googleapis';
import {
  asTwTime,
  toTwTime,
  twStartOf,
} from 'common/utils/time-helpers';
import readline from 'readline';
import XLSX from 'xlsx';
import { Readable } from 'stream';
import GoogleOAuth2Client from './GoogleOAuth2Client';

function bufferToStream(buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  return stream;
}

export default class GoogleDriveManager {
  goa2c: GoogleOAuth2Client;

  driveApiP?: drive_v3.Drive;

  constructor(goa2c) {
    console.log('goa2c :', goa2c);
    this.goa2c = goa2c;
  }

  get driveApi() {
    if (this.driveApiP) {
      return this.driveApiP;
    }
    this.driveApiP = google.drive({ version: 'v3', auth: this.goa2c.oAuth2Client });
    return this.driveApiP;
  }

  getStream() {
    const rowsToDownload = Array.from({ length: 72 });
    console.log('rowsToDownload :', rowsToDownload);
    const header = [
      { title: '訂單編號', get: (row, i) => i },
      { title: '專案代號', get: (row, i) => 'XXX' },
      { title: '會員編號', get: (row, i) => 'XXX' },
    ];
    const transform = (row, i) => header.reduce((m, h) => ({ ...m, [h.title]: h.get(row, i) }), {});
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rowsToDownload.map(transform), { header: header.map(h => h.title) });
    const wscols = header.map(h => ({ wch: 20 }));
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, '訂單');
    const resp = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
    return bufferToStream(resp);
  }

  async debugPrint() {
    const { data: { files } } = await this.driveApi!.files.list({
      pageSize: 20,
      fields: 'nextPageToken, files(id, name)',
    });
    const folder = files?.find(f => f.name === 'ShoplineReports');
    let folderId = folder?.id;
    if (!folderId) {
      try {
        const fileMetadata = {
          name: 'ShoplineReports',
          mimeType: 'application/vnd.google-apps.folder',
        };
        const res = await this.driveApi!.files.create({
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
      name: `${moment().format('YYYY-MM-DD')}-${new Date().getTime()}.xlsx`,
      originalFilename: fileName,
      parents: [folderId],
      mimeType: 'application/vnd.google-apps.spreadsheet',
    };
    const res = await this.driveApi!.files.create(
      {
        requestBody: fileMetadata,
        media: {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // Modified
          body: this.getStream(),
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
    return files;
  }
}
