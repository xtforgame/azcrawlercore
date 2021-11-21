/* eslint-disable no-unused-vars, no-undef */

import chai from 'chai';
import mainFunc from 'library';

import {
  data01,
  err01,
} from '../test-data';

declare const describe;
declare const beforeEach;
declare const afterEach;
declare const it;

const { expect } = <any>chai;

describe('Main Test Cases', () => {
  describe('Echo Test', function() {
    this.timeout(10000000);
    it('.then()', async () => {
      return mainFunc(data01)
      .then((result) => {
        expect(result).to.exists;
      });
    });
  });
});
