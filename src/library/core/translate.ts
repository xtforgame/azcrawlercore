import axios from 'axios';

export type CustomTranslator = { [s: string]: string } | ((s: string) => string | undefined | null);

export const translate = async (src : string, format: 'text' | 'html', customTranslator : CustomTranslator) => {
  if (!src) {
    return '';
  }
  let result : string | undefined | null;
  if (typeof customTranslator === 'function') {
    result = customTranslator(src);
  } else {
    result = customTranslator[src];
  }
  if (result != null) {
    return result;
  }
  try {
    const { data } = await axios({
      method: 'post',
      url: 'https://translation.googleapis.com/language/translate/v2?key=AIzaSyAbw3q6GEVeK_uIQN6TPdg1JSayOObZT-s',
      data: {
        q: src,
        source: 'en',
        target: 'zh-TW',
        format,
      },
    });
    result = data?.data?.translations?.[0]?.translatedText;
    return result;
    // fs.writeFileSync(`../apify_storage_z/key_value_stores/news/${symbol}.json`, JSON.stringify(newsJson), { encoding: 'utf-8' });
    // const x = await sendQuery(`UPDATE etf_info SET symbol = '${symbol}', issuer = '${}' WHERE symbol_uid = '${symbol}'`)
  } catch (error) {
    console.log('error :', error);
  }
  return result;
};

export const x = 1;
