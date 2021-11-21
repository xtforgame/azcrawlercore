/* eslint-disable no-unused-vars, no-undef */

import chai from 'chai';
// import EtfManager from './EtfManager';
import StockNewsManager from './StockNewsManager';
// import StockLabelManager from './StockLabelManager';
import StockDetailManager from './StockDetailManager';


const stockDetailManager = new StockDetailManager();
const stockNewsManager = new StockNewsManager();

const run = async () => {
  try {
    await stockDetailManager.run();
  } catch (error) {
    console.log('error :', error);
  }
  try {
    await stockNewsManager.run();
  } catch (error) {
    console.log('error :', error);
  }
};

run();
