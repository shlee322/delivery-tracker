const axios = require('axios');
const { JSDOM } = require('jsdom');
const qs = require('querystring');

const parseStatus = s => {
  if (s.includes('상품접수')) return { id: 'at_pickup', text: '상품인수' };
  if (s.includes('배송 출발'))
    return { id: 'out_for_delivery', text: '배송출발' };
  if (s.includes('배달 완료')) return { id: 'delivered', text: '배송완료' };
  return { id: 'in_transit', text: '이동중' };
};

const courierPattern = /.+\(배송담당:\s+(\S+) ([\d|-]+)\)/;

function getTrack(trackId) {
  return new Promise((resolve, reject) => {
    axios
      .post(
        'https://www.lotteglogis.com/home/reservation/tracking/linkView',
        qs.stringify({
          InvNo: trackId,
        })
      )
      .then(res => {
        const dom = new JSDOM(res.data);
        const { document } = dom.window;

        const tables = document.querySelectorAll('.tblH');

        return {
          informationTable: tables[0],
          progressTable: tables[1],
        };
      })
      .then(({ informationTable, progressTable }) => {
        const information = informationTable.querySelectorAll(
          'tbody > tr > td'
        );

        if (information.length === 1) {
          reject({
            code: 404,
            message: information[0].innerHTML,
          });
          return;
        }

        const shippingInformation = {
          from: { time: null, name: information[1].textContent },
          to: { time: null, name: information[2].textContent },
          state: {},
          progresses: (table => {
            const result = [];
            table.querySelectorAll('tbody > tr').forEach(element => {
              const tds = element.querySelectorAll('td');
              if (tds.length < 4) return;
              if (tds[1].textContent.indexOf('--:--') !== -1) return;

              result.push({
                status: parseStatus(tds[0].textContent),
                time: `${tds[1].textContent.replace(/\s+/g, 'T')}:00+09:00`,
                location: {
                  name: tds[2].textContent.trim(),
                },
                description: tds[3].textContent,
              });
            });
            return result;
          })(progressTable),
        };

        if (shippingInformation.progresses.length < 1) {
          const errorTd = progressTable.querySelector('tbody > tr > td');
          reject({
            code: 404,
            message: errorTd
              ? errorTd.textContent
              : '화물추적 내역이 없습니다.',
          });
        } else {
          shippingInformation.progresses = shippingInformation.progresses.reverse();
          const firstProgress = shippingInformation.progresses[0];
          const lastProgress =
            shippingInformation.progresses[
              shippingInformation.progresses.length - 1
            ];
          shippingInformation.state = lastProgress.status;
          shippingInformation.from.time = firstProgress.time;

          if (lastProgress.status.id === 'delivered') {
            shippingInformation.to.time = lastProgress.time;
          }
          const outForDelivery = shippingInformation.progresses.find(
            progress =>
              progress.status && progress.status.id === 'out_for_delivery'
          );
          if (outForDelivery) {
            const courierResult = courierPattern.exec(
              outForDelivery.description
            );
            if (courierResult && courierResult.length === 3) {
              shippingInformation.courier = {
                name: courierResult[1].trim(),
                contact: courierResult[2].trim(),
              };
            }
          }
        }

        resolve(shippingInformation);
      })
      .catch(err => reject(err));
  });
}

module.exports = {
  info: {
    name: '롯데택배',
    tel: '+8215882121',
  },
  getTrack,
};
