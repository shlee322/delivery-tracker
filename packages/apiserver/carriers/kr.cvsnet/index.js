const axios = require('axios');
const { JSDOM } = require('jsdom');

const STATUS_MAP = {
  0: { id: 'information_received', text: '방문예정' },
  1: { id: 'at_pickup', text: '상품인수' },
  2: { id: 'in_transit', text: '이동중' },
  3: { id: 'out_for_delivery', text: '배송출발' },
  4: { id: 'delivered', text: '배송완료' },
};

const STR_TO_STATUS = {
  집화처리: 1,
  배달출발: 3,
  배달완료: 4,
};

function getTrack(trackId) {
  return new Promise((resolve, reject) => {
    axios
      .get('https://www.cvsnet.co.kr/reservation-inquiry/delivery/index.do', {
        params: {
          dlvry_type: 'domestic',
          invoice_no: trackId,
          srch_type: '01',
        },
      })
      .then(res => {
        const dom = new JSDOM(res.data);
        const { document } = dom.window;

        const information = document.querySelectorAll(
          '.deliveryInfo3 table td'
        );
        const progresses = document.querySelectorAll('.deliveryInfo2 ul li');
        const state = document.querySelectorAll('.deliveryInfo li');
        const currentState = document.querySelector('.deliveryInfo li.on');

        if (information.length === 0) {
          reject({
            code: 404,
            message: document.querySelector('.noData p').textContent,
          });
        }

        return {
          information,
          progresses,
          state,
          currentState,
        };
      })
      .then(({ information, progresses, state, currentState }) => {
        const shippingInformation = {
          from: {
            name: information[4].innerHTML,
            time: `${
              information[2].innerHTML
            }T${information[3].innerHTML.trim()}:00+09:00`,
          },
          to: {
            name: information[5].innerHTML,
            time: null,
          },
          state: (function getState(s) {
            let index;
            s.forEach((e, i) => {
              if (e === currentState) index = i;
            });
            return STATUS_MAP[index];
          })(state, currentState),
          progresses: [],
        };

        progresses.forEach(element => {
          const time = (function convertTime(t) {
            return `${t.replace('&nbsp;', 'T')}+09:00`;
          })(element.querySelector('p.date').innerHTML);

          let status = STATUS_MAP[2];
          const description = element.querySelector('p.txt').innerHTML;
          // eslint-disable-next-line no-restricted-syntax
          for (const key in STR_TO_STATUS) {
            if (description.includes(key)) {
              status = STATUS_MAP[STR_TO_STATUS[key]];
              break;
            }
          }

          if (status.id === 'delivered') {
            shippingInformation.to = {
              ...shippingInformation.to,
              time,
            };
          }

          shippingInformation.progresses.unshift({
            time,
            location: { name: element.querySelector('p.location').innerHTML },
            status,
            description: element.querySelector('p.txt').innerHTML,
          });
        });

        resolve(shippingInformation);
      })
      .catch(err => reject(err));
  });
}

module.exports = {
  info: {
    name: 'GS Postbox 택배',
    tel: '+8215771287',
  },
  getTrack,
};

// getTrack('6690111396').then(res => console.log(JSON.stringify(res, null, 2))).catch(err => console.error(err))
// getTrack('0123456789').then(res => console.log(res)).catch(err=>console.error(err))
