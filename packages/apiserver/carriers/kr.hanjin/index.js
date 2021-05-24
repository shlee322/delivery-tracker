const axios = require('axios');
const { JSDOM } = require('jsdom');
const qs = require('querystring');
const Iconv = require('iconv').Iconv;
const iconv = new Iconv('EUC-KR', 'UTF-8');

function parseStatus(s) {
  if (s.includes('화물접수')) return { id: 'at_pickup', text: '상품인수' };
  if (s.includes('화물입고')) return { id: 'at_pickup', text: '상품인수' };
  if (s.includes('배송출발'))
    return { id: 'out_for_delivery', text: '배송출발' };
  if (s.includes('배송완료')) return { id: 'delivered', text: '배송완료' };
  return { id: 'in_transit', text: '이동중' };
}

function getTrack(trackId) {
  return new Promise((resolve, reject) => {
    if (trackId.length !== 10 && trackId.length !== 12) {
      reject({
        code: 404,
        message: '잘못된 운송장 번호입니다.',
      });
      return;
    }
    if (
      parseInt(trackId.substring(0, trackId.length - 1), 10) % 7 !==
      parseInt(trackId.substring(trackId.length - 1), 10)
    ) {
      reject({
        code: 404,
        message: '잘못된 운송장 번호입니다.',
      });
      return;
    }

    axios
      .get(
        `http://www.hanjinexpress.hanjin.net/customer/hddcw99gm.cgo_iframe?w_num=${trackId}`,{
          responseType: 'arraybuffer'
        })
      .then(res => {
        const dom = new JSDOM(res.data);
        const rows = dom.window.document.querySelectorAll('table tr');
        if (rows.length === 0) {
          return reject({
            code: 404,
            message: '내역이 존재하지 않습니다',
          });
        }

        return { rows };
      })
      .then(({ rows }) => {
        const shippingInformation = {
          from: {
            name: '',
            time: null,
          },
          to: {
            name: '',
            time: null,
          },
          state: {
            id: 'delivered',
            text: null,
          },
          progresses: [],
        };

        rows.forEach(element => {
          const insideTd = element.querySelectorAll('th, td');
          if(insideTd.length < 4) {
            return;
          }

          const timeText = insideTd[0].textContent.trim();
          const time = timeText.replace(/\./g, '-')
            .replace(/\s/g, 'T') + ':00+09:00'

          shippingInformation.progresses.push({
            time,
            location: {
              name: insideTd[1].textContent,
            },
            status: parseStatus(insideTd[2].textContent),
            description: insideTd[3].textContent,
          });
        });

        if (shippingInformation.progresses.length > 0) {
          shippingInformation.state =
            shippingInformation.progresses[
              shippingInformation.progresses.length - 1
            ].status;
          shippingInformation.from.time =
            shippingInformation.progresses[0].time;
          if (
            shippingInformation.progresses[
              shippingInformation.progresses.length - 1
            ].status.id === 'delivered'
          )
            shippingInformation.to.time =
              shippingInformation.progresses[
                shippingInformation.progresses.length - 1
              ].time;
        } else {
          shippingInformation.state = {
            id: 'information_received',
            text: '방문예정',
          };
        }

        resolve(shippingInformation);
      })
      .catch(err => reject(err));
  });
}

module.exports = {
  info: {
    name: '한진택배',
    tel: '+8215880011',
  },
  getTrack,
};
