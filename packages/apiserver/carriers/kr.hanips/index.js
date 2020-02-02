const axios = require('axios');
const { Iconv } = require('iconv');

const { JSDOM } = require('jsdom');
const qs = require('querystring');

const iconv = new Iconv('EUC-KR', 'UTF-8//TRANSLIT//IGNORE');

const STATUS_TEXT_MAP = {
  at_pickup: '상품인수',
  in_transit: '이동중',
  out_for_delivery: '배송출발',
  delivered: '배송완료',
};

function parseStatusId(s) {
  if (s.includes('접수했습니다')) return 'at_pickup';
  if (s.includes('배송예정')) return 'out_for_delivery';
  if (s.includes('배송완료')) return 'delivered';
  return 'in_transit';
}

function parseTime(s) {
  const match = s.match(/^(.+) (\d\d):(\d\d)(AM|PM)$/i);
  if (!match) return null;

  if (match[4] === 'PM') {
    match[2] = parseInt(match[2], 10) + 12;
  }

  return `${match[1]}T${match[2]}:${match[3]}:00+09:00`;
}

function getTrack(trackId) {
  const trimString = s => {
    return s.replace(/([\n\t]{1,}|\s{2,})/g, ' ').trim();
  };

  return new Promise((resolve, reject) => {
    axios
      .post(
        'http://www.hanips.com/check/sub03_03_1.php',
        qs.stringify({
          logicnum: trackId,
        }),
        {
          responseType: 'arraybuffer',
        }
      )
      .then(res => {
        const dom = new JSDOM(iconv.convert(res.data).toString('utf-8'));
        const { document } = dom.window;

        const tables = document.querySelectorAll('.subject table');

        if (tables.length < 1) {
          return reject({
            code: 404,
            message: '운송장번호를 다시한번 확인하여 주세요.',
          });
        }

        return {
          info: tables[0].querySelectorAll('td:nth-child(2n)'),
          progresses: tables[1].querySelectorAll('tr:not(:first-child)'),
        };
      })
      .then(({ info, progresses }) => {
        const shippingInformation = {
          from: {
            name: trimString(info[2].textContent),
          },
          to: {
            name: trimString(info[4].textContent),
          },
          state: { id: 'information_received', text: '접수' },
          progresses: [],
        };

        progresses.forEach(element => {
          const tds = element.querySelectorAll('td');
          const statusID = parseStatusId(trimString(tds[3].textContent));

          shippingInformation.progresses.push({
            location: {
              name: trimString(tds[0].textContent),
            },
            time: parseTime(trimString(tds[1].textContent)),
            description: `${trimString(
              tds[3].textContent
            )}\n담당자: ${trimString(tds[2].textContent)}`,
            status: { id: statusID, text: STATUS_TEXT_MAP[statusID] },
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
    name: '한의사랑택배',
    tel: '+8216001055',
  },
  getTrack,
};
