const axios = require('axios')
const { JSDOM } = require('jsdom')
const Cookie = require('tough-cookie').Cookie;
const qs = require('querystring')

const trimString = (s) => {
  return s.replace(/([\n\t]{1,}|\s{2,})/g, ' ').trim()
}

const parseStatus = (s) => {
  if(s.includes('보내')) return {id: 'at_pickup', text:'상품인수'}
  if(s.includes('배달 예정')) return {id: 'out_for_delivery', text:'배송출발'}
  if(s.includes('배달 완료')) return {id: 'delivered', text:'배송완료'}
  return {id: 'in_transit', text: '이동중'}
}

function getTrack(trackId) {
  return new Promise((resolve, reject) => {
    axios.post('https://www.lotteglogis.com/home/personal/inquiry/track', qs.stringify({
      InvNo: trackId,
      action: 'processInvoiceSubmit',
    })).then(res => {
      const cookie = res.headers['set-cookie'].map(Cookie.parse).map(c => c.cookieString()).join('; ')
      return new Promise((resolve, reject) => {
        setTimeout(() => { resolve({ cookie }) }, 2400)
      })
    }).then(({ cookie }) => {
      return axios.post('https://www.lotteglogis.com/home/personal/inquiry/track', qs.stringify({
        action: 'processInvoiceLinkSubmit',
      }), {
        headers: {
          Cookie: cookie,
        },
      })
    }).then(res => {
      const dom = new JSDOM(res.data)
      const document = dom.window.document

      return {
        informationTable: document.querySelector('.mat_30 .table_02'),
        progressTable: document.querySelector('.mat_30:nth-child(2) + div .table_02')
      }
    }).then(({ informationTable, progressTable }) => {
      if ( informationTable.querySelector('tr:last-child td').getAttribute('colspan') === '4' ) {
        return reject({
          code: 404,
          mesage: informationTable.querySelector('tr:last-child td').innerHTML,
        })
      }

      let shippingInformation = {
        from: {time: null},
        to: {time: null},
        state: {},
        progresses: ((table) => {
          let result = []
          table.querySelectorAll('tr').forEach(element => {
            const tds = element.querySelectorAll('td')
            if ( tds.length === 0 ) { return }
            if ( tds[1].innerHTML == '--:--' ) { return }
            result.push({
              time: `${tds[0].innerHTML.replace(/\./g, '-')}T${tds[1].innerHTML}:00+09:00`,
              location: {
                name: trimString(tds[2].textContent),
              },
              status: parseStatus(tds[3].textContent),
              description: trimString(tds[3].textContent),
            })
          })
          return result
        })(progressTable),
      }

      if(shippingInformation.progresses.length < 1) {
        shippingInformation.state = {id: 'information_received', text:'방문예정'}
      } else {
        shippingInformation.state = shippingInformation.progresses[shippingInformation.progresses.length - 1].status
        shippingInformation.from.time = shippingInformation.progresses[0].time

        if(shippingInformation.progresses[shippingInformation.progresses.length - 1].status.id == 'delivered')
          shippingInformation.to.time = shippingInformation.progresses[shippingInformation.progresses.length - 1].time
      }

      resolve(shippingInformation)
    }).catch(err => reject(err))
  })
}

module.exports = {
  info: {
    name: '롯데택배',
    tel: '+8215882121',
  },
  getTrack: getTrack,
}

// getTrack('401041508125').then(res => console.log(JSON.stringify(res, 0, 2))).catch(err => console.log(err))
