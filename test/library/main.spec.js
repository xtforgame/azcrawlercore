/* eslint-disable no-unused-vars, no-undef */

import chai from 'chai';
// import EtfManager from 'library/EtfManager';
import StockNewsManager from 'library/StockNewsManager';
// import StockLabelManager from 'library/StockLabelManager';
// import StockDetailManager from 'library/StockDetailManager';

import {
  data01,
  err01,
} from '../test-data';

const { expect } = chai;

describe('Main Test Cases', () => {
  describe('Echo Test', function () {
    this.timeout(30000000);
    it('.then()', async () => {
      const mgr = new StockNewsManager();
      await mgr.run();
    });
  });
  // describe('Echo Test', function () {
  //   this.timeout(30000000);
  //   it('.then()', async () => {
  //     const etfManager = new EtfManager();
  //     await etfManager.run();
  //   });
  // });
});
