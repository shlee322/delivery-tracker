const axios = require('axios');
const { JSDOM } = require('jsdom');

const STATUS_ID_MAP = {
  접수: 'information_received',
  발송: 'at_pickup',
  배송완료: 'delivered',
};

function getTrack(trackId) {
  const trimString = s => {
    return s.replace(/([\n\t]{1,}|\s{2,})/g, ' ').trim();
  };

  return new Promise((resolve, reject) => {
    axios
      .get('http://www.chunil.co.kr/HTrace/HTrace.jsp', {
        params: {
          transNo: trackId,
        },
      })
      .then(res => {
        const dom = new JSDOM(res.data);
        const { document } = dom.window;

        const tables = document.querySelectorAll('table[cellspacing="1"]');

        if (tables.length === 0) {
          return reject({
            code: 404,
            message:
              '운송장이 등록되지 않았거나 업체에서 상품을 준비중이니 업체로 문의해주시기 바랍니다.',
          });
        }

        return {
          from: tables[0].querySelectorAll('td:nth-child(2n)'),
          to: tables[1].querySelectorAll('td:nth-child(2n)'),
          item: tables[2].querySelectorAll('td:nth-child(2n)'),
          progresses: tables[4].querySelectorAll('tr:not(:first-child)'),
        };
      })
      .then(({ from, to, item, progresses }) => {
        const shippingInformation = {
          from: {
            name: from[0].textContent,
            address: trimString(from[1].textContent),
          },
          to: {
            name: to[0].textContent,
            address: trimString(to[1].textContent),
          },
          state: { id: 'information_received', text: '접수' },
          item: item[0].textContent,
          progresses: [],
        };

        progresses.forEach(element => {
          const tds = element.querySelectorAll('td');

          shippingInformation.progresses.push({
            time: `${tds[0].textContent}T00:00:00+09:00`,
            location: { name: tds[1].textContent },
            description: `연락처: ${tds[2].textContent}`,
            status: {
              id: STATUS_ID_MAP[tds[3].textContent] || 'in_transit',
              text: tds[3].textContent,
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
    name: '천일택배',
    tel: '+8218776606',
  },
  getTrack,
};
