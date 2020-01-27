const axios = require('axios');
const { Iconv } = require('iconv');
const { JSDOM } = require('jsdom');

const iconv = new Iconv('EUC-KR', 'UTF-8//TRANSLIT//IGNORE');

function getTrack(trackId) {
  const trimString = s => {
    return s.replace(/([\n\t]{1,}|\s{2,})/g, ' ').trim();
  };

  return new Promise((resolve, reject) => {
    axios
      .get('http://www.kunyoung.com/goods/goods_01.php', {
        params: {
          mulno: trackId,
        },
        responseType: 'arraybuffer',
      })
      .then(res => {
        const dom = new JSDOM(iconv.convert(res.data).toString('utf-8'));
        const { document } = dom.window;

        const error = document.querySelector(
          'td[height="30"][align="center"][colspan="9"]:not(.subtxt1)'
        );
        if (error) {
          return reject({
            code: 404,
            message: error.textContent,
          });
        }

        return axios.get('http://www.kunyoung.com/goods/goods_02.php', {
          params: {
            mulno: trackId,
          },
          responseType: 'arraybuffer',
        });
      })
      .then(res => {
        const dom = new JSDOM(iconv.convert(res.data).toString('utf-8'));
        const { document } = dom.window;

        const tables = document.querySelectorAll('table[width="717"]');

        return {
          info: tables[1].querySelectorAll('td:not(.subtxt1)'),
          progresses: tables[3].querySelectorAll('tr:nth-child(2n+4)'),
        };
      })
      .then(({ info, progresses }) => {
        const shippingInformation = {
          from: {
            name: trimString(info[5].textContent),
            tel: trimString(info[6].textContent),
            address: trimString(info[7].textContent),
          },
          to: {
            name: trimString(info[2].textContent),
            tel: trimString(info[3].textContent),
            address: trimString(info[4].textContent),
          },
          state: { id: 'information_received', text: '접수' },
          progresses: [],
        };

        progresses.forEach(element => {
          const tds = element.querySelectorAll('td:nth-child(2n+1)');

          shippingInformation.progresses.push({
            time: `${tds[0].textContent.replace(' ', 'T')}+09:00`,
            description: `연락처: ${tds[2].textContent}`,
            status: {
              id:
                tds[1].textContent.indexOf('배송완료') !== -1
                  ? 'delivered'
                  : 'in_transit',
              text: tds[1].textContent,
            },
          });
        });

        const lastProgress =
          shippingInformation.progresses[
            shippingInformation.progresses.length - 1
          ];
        if (lastProgress) {
          shippingInformation.state = lastProgress.status;
          if (lastProgress.status.id === 'delivered')
            shippingInformation.to.time = lastProgress.time;
        }

        resolve(shippingInformation);
      })
      .catch(err => reject(err));
  });
}

module.exports = {
  info: {
    name: '건영택배',
    tel: '+82533543001',
  },
  getTrack,
};
