/* eslint-disable no-unused-vars, no-undef */

import chai from 'chai';
import EtfManager from 'library/EtfManager';

import {
  data01,
  err01,
} from '../test-data';

const { expect } = chai;

describe('Main Test Cases', () => {
  describe('Echo Test', function () {
    this.timeout(30000000);
    it('.then()', async () => {
      const etfManager = new EtfManager();
      await etfManager.update();
    });
  });
});
