const axios = require('axios');
const { JSDOM } = require('jsdom');
const qs = require('querystring');

function parseStatus(s) {
  if (s.includes('집하')) return { id: 'at_pickup', text: '상품인수' };
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
      .post(
        'https://m.hanex.hanjin.co.kr/inquiry/incoming/resultWaybill',
        qs.stringify({
          div: 'B',
          show: 'true',
          wblNum: trackId,
        })
      )
      .then(res => {
        const dom = new JSDOM(res.data);
        const tables = dom.window.document.querySelectorAll('table');
        if (tables.length === 0) {
          return reject({
            code: 404,
            message: dom.window.document.querySelector('.noData').textContent,
          });
        }

        return { informationTable: tables[0], progressTable: tables[1] };
      })
      .then(({ informationTable, progressTable }) => {
        const td = informationTable.querySelectorAll('td');

        const shippingInformation = {
          from: {
            name: td[1].textContent,
            time: null,
          },
          to: {
            name: td[2].textContent,
            time: null,
          },
          state: {
            id: 'delivered',
            text: null,
          },
          progresses: [],
        };

        progressTable.querySelectorAll('tr').forEach(element => {
          const insideTd = element.querySelectorAll('th, td');
          if(insideTd.length < 3) {
            return;
          }
          // TODO : time 년도 처리 나중에 수정 해야 함 (현재 시간하고 마지막 시간하고 비교해서 마지막 시간이 미래면 작년 껄로 처리)
          const curTime = new Date();
          let time = `${curTime.getFullYear()}-${insideTd[0].innerHTML
            .replace('<br>', 'T')
            .replace(/<[^>]*>/gi, '')
            .replace(/\./gi, '-')}:00+09:00`;

          if (new Date(time) > curTime) {
            time = `${curTime.getFullYear() - 1}${time.substring(4)}`;
          }

          shippingInformation.progresses.unshift({
            time,
            location: {
              name: insideTd[1].textContent,
            },
            status: parseStatus(insideTd[2].textContent),
            description: insideTd[2].textContent,
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
