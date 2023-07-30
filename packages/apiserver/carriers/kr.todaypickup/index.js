const axios = require('axios');
const { JSDOM } = require('jsdom');

function parseStatus(s) {
  if (s.includes('접수')) return { id: 'information_received', text: '상품준비중' };
  if (s.includes('수거')) return { id: 'at_pickup', text: '상품인수' };
  if (s.includes('배송 중'))
    return { id: 'out_for_delivery', text: '배송출발' };
  if (s.includes('도착')) return { id: 'delivered', text: '배송완료' };
  return { id: 'in_transit', text: '이동중' };
}

function parseDescription(s) {
    // 배송 완료 이미지의 경우 v1에서는 제공 안하고, v2에서 htmlDescription 으로 사용자가 선택할 수 있게 제공
    if (s.indexOf("배송완료 사진 보기") !== -1) {
        return s.replace("배송완료 사진 보기", "").trim();
    }
    return s;
}

function getTrack(trackId) {
  return new Promise((resolve, reject) => {
    axios
      .get(`https://mall.todaypickup.com/front/delivery/list/${encodeURI(trackId)}`)
      .then(res => {
        const dom = new JSDOM(res.data);

        const tbodyList = dom.window.document.querySelectorAll('tbody');

        const informationTable = tbodyList[1];
        const progressTable = tbodyList[2];
        
        const informationTableTdList = informationTable.querySelectorAll('td');
        const trackIdText = informationTableTdList[0].textContent.replace(/[\n\s]/g, "");
        if (trackIdText === "") {
          const errorMessage = informationTableTdList[1].textContent.replace(/[\n\s]/g, "");
          if (errorMessage.indexOf("배송정보가 없") !== -1) {
            return reject({
              code: 404,
              message: errorMessage,
            });
          }

          return reject({
            code: 400,
            message: errorMessage,
          });
        }

        return { informationTable, progressTable };
      })
      .then(({ informationTable, progressTable }) => {
        const shippingInformation = {
          from: { name: null, time: null },
          to: {
            name: informationTable.querySelector('td:nth-child(3)').textContent.replace(/[\n\s]/g, ""),
            time: null
          },
          state: { id: 'information_received', text: '상품준비중' },
          progresses: [],
        };

        progressTable.querySelectorAll('tr').forEach(element => {
          const tdList = element.querySelectorAll('td');
          if (tdList.length < 3) return;

          const date = tdList[0].textContent.replace(/[\n]/g, " ").replace(/\s{2,}/g, " ").trim();
          const location = tdList[1].textContent.replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim();
          const description = tdList[2].textContent.replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim();
          
          shippingInformation.progresses.push({
            time: `${date.replace(' ', 'T').replace(/\./g, '-')}:00+09:00`,
            location: {
              name: location,
            },
            status: parseStatus(description),
            description: parseDescription(description),
          });

          if (shippingInformation.progresses.length > 0) {
            shippingInformation.state = shippingInformation.progresses[shippingInformation.progresses.length - 1].status;
            shippingInformation.from.time = shippingInformation.progresses[0].time;
            if (shippingInformation.progresses[shippingInformation.progresses.length - 1].status.id === 'delivered')
              shippingInformation.to.time = shippingInformation.progresses[shippingInformation.progresses.length - 1].time;
          } else {
            shippingInformation.state = {
              id: 'information_received',
              text: '방문예정',
            };
          }
        });
        resolve(shippingInformation);
      })
      .catch(err => reject(err));
  });
}

module.exports = {
  info: {
    name: '오늘의픽업',
    tel: '+8216665615',
  },
  getTrack,
};
