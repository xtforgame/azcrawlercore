/* eslint-disable no-unused-vars, no-undef */

import chai from 'chai';
import mainFunc from 'library';

import {
  data01,
  err01,
} from '../test-data';

const { expect } = chai;

describe('Main Test Cases', () => {
  describe('Basic', () => {
    it('mainFunc should be a function', () => {
      expect(mainFunc).to.be.an.instanceof(Function);
      return true;
    });
  });

  describe('Echo Test', function () {
    this.timeout(30000000);
    it('.then()', async () => {
      await mainFunc(data01);
    });
  });
});
