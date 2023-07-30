const axios = require('axios');
const qs = require('querystring');
const { JSDOM } = require('jsdom');

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
        'https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do',
        qs.stringify({
          wblnum: trackId,
          mCode: 'MN038',
          schLang: 'KR',
        }),
        {
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          responseType: 'text',
          responseEncoding: 'utf8',
        }
      )
      .then(res => {
        const dom = new JSDOM(res.data);

        const tit = dom.window.document.querySelector('.tit-sec');
        if(tit) {
          const message = tit.textContent.trim();
          if (message.indexOf("운송장이 등록되지 않") !== -1) {
            return reject({
              code: 404,
              message: message,
            });
          }
          if (message.indexOf("잘못된 운송장") !== -1) {
            return reject({
              code: 400,
              message: message,
            });
          }
        }

        const tables = dom.window.document.querySelectorAll('table');
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

        const { progresses } = shippingInformation;

        progressTable.querySelector('tbody').querySelectorAll('tr').forEach(element => {
          const insideTd = element.querySelectorAll('td');
          // 간혹 <tr></tr> 형태가 섞여있음
          if (insideTd.length < 4) return;
          const date = insideTd[0].textContent; // insideTd[0] - 날짜 (ex. 2021-04-13)
          const time = insideTd[1].textContent; // insideTd[1] - 시간 (ex. 10:37)
          const address = insideTd[2].textContent; // insideTd[2] - 위치
          const description = insideTd[3].textContent.trim();// insideTd[3] - 설명
          const timeSet = `${date}T${time}:00+09:00`;
          
          progresses.unshift({
            time: timeSet,
            location: {
              name: address,
            },
            status: parseStatus(description),
            description: description,
          });
        });

        if (progresses.length > 0) {
          shippingInformation.state = progresses[0].status;
          shippingInformation.from.time = progresses[progresses.length - 1].time;
          if (progresses[0].status.id === 'delivered')
            shippingInformation.to.time = progresses[0].time;
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
