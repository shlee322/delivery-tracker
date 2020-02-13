// const { Iconv } = require('iconv');
const axios = require('axios');
const cheerio = require('cheerio')

// const iconv = new Iconv('EUC-KR', 'UTF-8//TRANSLIT//IGNORE');

function parseStatus(s) {
  if (s.includes('터미널입고')) return { id: 'at_pickup', text: '상품인수' };
  if (s.includes('배송출고'))
    return { id: 'out_for_delivery', text: '배송출발' };
  if (s.includes('배송완료')) return { id: 'delivered', text: '배송완료' };
  return { id: 'in_transit', text: '이동중' };
}

function getTrack(trackId) {
  // const trimString = s => {
  //   return s.replace(/([\n\t]{1,}|\s{2,})/g, ' ').trim();
  // };
  const tdToDescription = (td, $) => {
    const headers = ['발송점', '도착점', '담당직원', '인수자', '영업소', '연락처'];
    return headers
      .map((header, i) => {
        return $(td[i + 2]).text().trim() !== ''
          ? `${header}: ${$(td[i + 2]).text().trim()}`
          : null;
      })
      .filter(obj => obj !== null)
      .join(', ');
  };

  return new Promise((resolve, reject) => {
    axios
      .get(
        `https://www.ilogen.com/web/personal/trace/${encodeURI(trackId)}`,
        {
          responseType: 'arraybuffer',
        }
      )
      .then(res => {
        const $ = new cheerio.load(res.data.toString('utf-8'));

        const tables = $('tbody');
        const informationTable = tables[0];
        const progressTable = tables[1];

        if (!progressTable) {
          return reject({
            code: 404,
            message: '운송장 정보를 찾을 수 없습니다.',
          });
        }

        return { informationTable: $(informationTable), progressTable: $(progressTable), $ };
      })
      .then(({ informationTable, progressTable, $ }) => {
        const shippingInformation = {
          from: {
            name: informationTable.children('tr').eq(3).children('td').eq(1).text().trim(),
            time: null,
          },
          to: {
            name: informationTable.children('tr').eq(3).children('td').eq(3).text().trim(),
            time: null,
          },
          state: null,
          progresses: [],
        };

        progressTable.children('tr').each((index, element) => {
          const td = $(element).children('td');
          if (td.eq(0).text().trim() === '') {
            return;
          }
          shippingInformation.progresses.push({
            time: `${td.eq(0).text().replace(' ', 'T').replace(/\./g, '-')}:00+09:00`,
            location: {
              name: td.eq(1).text(),
            },
            status: parseStatus(td.eq(2).text()),
            description: tdToDescription(td, $),
          });
        });

        shippingInformation.state =
          shippingInformation.progresses[
            shippingInformation.progresses.length - 1
          ].status;

        shippingInformation.from.time = shippingInformation.progresses[0].time;
        if (
          shippingInformation.progresses[
            shippingInformation.progresses.length - 1
          ].status.id === 'delivered'
        )
          shippingInformation.to.time =
            shippingInformation.progresses[
              shippingInformation.progresses.length - 1
            ].time;

        resolve(shippingInformation);
      })
      .catch(err => reject(err));
  });
}

module.exports = {
  info: {
    name: '로젠택배',
    tel: '+8215889988',
  },
  getTrack,
};
