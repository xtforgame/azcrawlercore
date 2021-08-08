/* eslint-disable no-unused-vars, no-undef */

import chai from 'chai';
// import EtfManager from './EtfManager';
import StockNewsManager from './StockNewsManager';
// import StockLabelManager from './StockLabelManager';
// import StockDetailManager from './StockDetailManager';


const mgr = new StockNewsManager();
const run = async () => {
  await mgr.run();
};

run();
