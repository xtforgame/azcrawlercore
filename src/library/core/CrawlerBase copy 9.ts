import fs from 'fs';
import path from 'path';
import moment from 'moment';
import OpenAI from 'openai';
import { google, drive_v3, gmail_v1 } from 'googleapis';
import puppeteer, { launch, Browser, ElementHandle, Page } from 'puppeteer';
import { promiseReduce, promiseWait, promiseWaitFor } from '~/utils';
import { scanAndSyncCodePages, updateCodeFromJson, updateCode, fetchCodePage, listCodePages, loadCodePage, saveCodePage } from '~/core/editorutils';
import ShoplineCrawlerBase from './ShoplineCrawlerBase';

export type PuppeteerLaunchOptions = Parameters<typeof launch>[0];

process.env.OPENAI_API_KEY = '.....';

const openai = new OpenAI();

type CompletionData = {
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  // completion: OpenAI.Chat.Completions.ChatCompletion,
};

type ReplyOptions = {
  userId?: any;
  systemMessages?: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
}

export default class CrawlerBase extends ShoplineCrawlerBase {
  async init() {
    this.gmailApis = await Promise.all([
      await this.createGmailApi('googleapp_tokens-xt.json'),
      await this.createGmailApi('googleapp_tokens-bsd.json'),
      // await this.createDriveApi('googleapp_tokens-c2.json'),
    ]);
  }

  async reply(options: ReplyOptions) {
    let systemMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { 'role': 'system', 'content': '你是代表一個名為「STUDIO DOE」的服飾品牌的客服人員，請在合理的範圍內回答客人問題' },
      {
        'role': 'system',
        'content': `
          目前我們只支援訂單退貨功能：首先，這個功能你需要透過對話釐清客人想退貨的訂單id，若詢問到id，則請呼叫getOrderDetail這個function call。
          若確認訂單無誤，則接著逐步詢問哪些商品想要退貨。當你蒐集完資料後，請呼叫returnOrder這個function call，即完成退貨流程。
        `,
      },
      { 'role': 'system', 'content': '除此之外你可以進行簡單的招呼語，但不要隨意承諾客人無關的事情' },
      { 'role': 'system', 'content': '如果途中發現對話並不順利，客人已經出現不滿情緒，請呼叫transfer這個function call轉接真人客服接手' },
    ];

    if (options.systemMessages) {
      ({ systemMessages } = options);
    }


    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        ...systemMessages,
        ...(options.messages || []),
      ],
      functions: [
        {
          name: 'getOrderDetail',
          description: '查詢訂單',
          parameters: {
            type: 'object',
            properties: {
              orderId: {
                type: 'string',
                description: '訂單ID',
              },
            },
            required: ['orderId'],
          },
        },
        {
          name: 'returnOrder',
          description: '成立退貨單',
          parameters: {
            type: 'object',
            properties: {
              orderId: {
                type: 'string',
                description: '訂單ID',
              },
              returnedList: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    // rolename: {
                    //   type: 'string',
                    //   enum: ['role1', 'role2', 'admin'],
                    //   description: 'The name of the role to be updated.',
                    // },
                    productId: {
                      type: 'string',
                      description: '商品ID',
                    },
                    returnedQuantity: {
                      type: 'number',
                      description: '退貨數量',
                    },
                  },
                  required: ['productId', 'returnedQuantity'],
                },
              },
            },
            required: ['orderId', 'returnedList'],
          },
        },
        {
          name: 'transfer',
          description: '轉接客服',
          parameters: {
            type: 'object',
            properties: {
            },
            required: [],
          },
        },
      ],
      function_call: 'auto',
    });


    const completionResponse = completion.choices[0].message; // Extract the generated completion from the OpenAI API response

    console.log('completionResponse: ', completionResponse); // Output the generated response to the console

    if (!completionResponse.content) { // Check if the generated response includes a function call
      const functionCallName = completionResponse.function_call!.name;
      console.log('functionCallName: ', functionCallName);
      if (functionCallName === 'getOrderDetail') { // If the function being called is 'lookupTime'
        const completionArguments = JSON.parse(completionResponse.function_call!.arguments); // Extract the argument for the function call
        console.log('completionArguments: ', completionArguments);

        try {
          const nrECommerceMiscController = {
            getOrderInfo(a: any) {
              return {
                user_id: null,
                orderId: null,
                order: null as any,
                orderInfo: null,
                products: [],
              };
            }
          };
          const {
            orderId,
            order,
            orderInfo,
          } = (await nrECommerceMiscController.getOrderInfo(completionArguments.orderId)) || {};
          if (order && order.user_id == options.userId) {
            return {
              response: `您的訂單細節如下：
訂單ID：${completionArguments.orderId}
${order.products.map(p => `商品（ID: ${p.product.id}）：${p.product.name} - ${p.quantity} 件`).join('\n')}

請問您要退貨的商品和數量是哪些呢？
`,
            };
          } else {
            return {
              response: `很抱歉，查無此訂單，請問您的訂單id是否為：${completionArguments.orderId} ？`,
            };
          }
        } catch (error) {
          console.log('error :', error);
          // return ctx.body = `
          //   alert("伺服器錯誤，請稍後再試");
          // `;
        }

        return {
          response: '已成立退貨單',
        };
      } else if (functionCallName === 'returnOrder') { // If the function being called is 'lookupTime'
        const completionArguments = JSON.parse(completionResponse.function_call!.arguments); // Extract the argument for the function call
        console.log('completionArguments: ', completionArguments);

        try {
          const nrECommerceMiscController = {
            getOrderInfo(a: any) {
              return {
                user_id: null,
                orderId: null,
                order: null as any,
                orderInfo: null,
                products: [],
              };
            }
          };
          const {
            orderId,
            order,
            orderInfo,
          } = await nrECommerceMiscController.getOrderInfo(completionArguments.orderId);
          if (order && order.user_id == options.userId) {
            return {
              response: '已成立退貨單',
            };
          } else {
            return {
              response: `很抱歉，查無此訂單，請問您的訂單id是否為：${completionArguments.orderId} ？`,
            };
          }
        } catch (error) {
          console.log('error :', error);
          // return ctx.body = `
          //   alert("伺服器錯誤，請稍後再試");
          // `;
        }

        return {
          response: '已成立退貨單',
        };
      } else if (functionCallName === 'transfer') { // If the function being called is 'lookupTime'
        const completionArguments = JSON.parse(completionResponse.function_call!.arguments); // Extract the argument for the function call
        console.log('completionArguments: ', completionArguments);

        return {
          response: '造成您的困擾十分抱歉，我立刻為您轉接給同仁',
        };
      }
    }

    return {
      response: completionResponse.content || 'xxxxx',
    };
  }

  async replyFirstMessage(page: Page) {
    await promiseWaitFor(2000, async () => {
      await promiseWaitFor(1000, async () => {
        const $lis = await page.$$('li[data-customer-id]:not([data-customer-id=""])');
        console.log('$lis :', $lis);
        if (Array.from($lis).length === 0) {
          return false;
        }
        const liNames = await page.$$eval('li[data-customer-id]:not([data-customer-id=""])', ($lis) => {
          return Array.from($lis).map(e => (e.getAttribute('data-customer-id') || '').trim());
        });
        // console.log('liNames :', liNames);

        await $lis[0].click();
        return true;
      });

      const $messages: {
        element: ElementHandle<HTMLDivElement>;
        from: string;
      }[] = [];

      await promiseWaitFor(1000, async () => {
        const $divs = await page.$$('#side-panel-parent > div > div > div > div > div > div');
        console.log('$divs :', $divs);
        if (Array.from($divs).length === 0) {
          return false;
        }
        let messageInfoList = await page.$$eval('#side-panel-parent > div > div > div > div > div > div', ($divs) => {
          return Array.from($divs).map((e) => {
            const c = (e.getAttribute('class') || '').trim();
            return {
              class: c,
              isMessage: c.startsWith('_message_'),
              isFromOther: c.includes('message--from--others'),
              text: e.querySelector('div.relative > div > div')?.textContent as string,
            };
          });
        });
        messageInfoList = messageInfoList.filter(dn => dn.isMessage);
        // console.log('messageInfoList :', messageInfoList);

        // console.log('messageInfoList.length :', messageInfoList.length);
        console.log('messageInfoList[messageInfoList.length - 1].isFromOther :', messageInfoList[messageInfoList.length - 1]);
        if (messageInfoList.length > 0 && messageInfoList[messageInfoList.length - 1].isFromOther) {
          const { response } = await this.reply({
            messages: messageInfoList.map(message => ({
              role: message.isFromOther ? 'user' : 'assistant',
              content: message.text,
            })),
          });
          await page.type('textarea[placeholder="輸入訊息......"]', `[機器人回覆]${response}`, {
            delay: 20,
          });
          await page.click('button._button_1rewt_1._secondary_1rewt_45');
        }

        return true;
      });
    });
  }

  async runX() {
    const browser = await puppeteer.launch(this.getPuppeteerLaunchOptions(true));
    try {
      if (1 == 1) {
        const page = await this.newPage(browser);
        await page.goto('https://console.appier.com', {
          waitUntil: 'networkidle2',
        });
        const session = await page.target().createCDPSession();
        await session.send('Page.enable');
        // await page.$eval('input[data-qa-id=loginUserName]', ($input) => {
        //   ($input as HTMLInputElement).value = 'rick.chen@studiodoe.com';
        //   const event = new Event('change');
        //   $input.dispatchEvent(event);
        // });


        await promiseWaitFor(1000, async () => {
          await page.type('#username', 'rick.chen@studiodoe.com', {
            delay: 20,
          });
          await page.type('#password', '1qqw1qqw', {
            delay: 20,
          });
          await page.click('button[name=action][type=submit]');
          return true;
        });

        await promiseWaitFor(1000, async () => {
          return !page.url().startsWith('https://auth.appier.com');
        });

        await page.goto('https://console.appier.com/project/project-h039bmWso/flows', {
          waitUntil: 'networkidle2',
        });

        await promiseWait(2000);

        await promiseWaitFor(1000, async () => {
          const $spans = await page.$$('div#side-panel-parent > div > div > div span');
          const spanNames = await page.$$eval('div#side-panel-parent > div > div > div span', ($spans) => {
            return Array.from($spans).map(e => (e.textContent || '').trim());
          });
  
          const i = spanNames.indexOf('即時訊息');
          await $spans[i].click();

          // console.log('spanNames :', spanNames);
          return true;
        });


        await this.replyFirstMessage(page);

        // await promiseReduce(Array.from($spans), async (_, $span, i) => {
        //   await $span.click();
        // }, null);
        
        await promiseWait(20000000);
      }
      console.log('done');
    } catch (error) {
      console.log('error :', error);
    }

    // await promiseWait(9999999);
    await browser.close();
  }

  async run() {
    await this.init();
    await this.runX();
    return 1;
  }
}

