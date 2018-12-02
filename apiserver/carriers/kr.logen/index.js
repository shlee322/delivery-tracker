const iconv  = new require('iconv').Iconv('EUC-KR', 'UTF-8//TRANSLIT//IGNORE')
const axios = require('axios')
const { JSDOM } = require('jsdom')
const qs = require('querystring')

function parseStatus(s) {
  if(s.includes('터미널입고')) return {id: 'at_pickup', text:'상품인수'}
  if(s.includes('배송출고')) return {id: 'out_for_delivery', text:'배송출발'}
  if(s.includes('배송완료')) return {id: 'delivered', text:'배송완료'}

  return {id: 'in_transit', text: '이동중'}
}

function getTrack(trackId) {
  const trimString = (s) => {
    return s.replace(/([\n\t]{1,}|\s{2,})/g, ' ').trim()
  }
  const tdToDescription = (td) => {
    const headers = ['발송점', '도착점', '담당직원', '인수자', '영업소']
    return headers.map((header, i) => {
      return td[i+3].textContent.trim() != '' ? `${header}:${td[i+3].textContent.trim()}` : null
    }).filter(obj => obj !== null).join(', ')
  }

  return new Promise((resolve, reject) => {
    axios.get('https://www.ilogen.com/iLOGEN.Web.New/TRACE/TraceDetail.aspx?' + qs.stringify({slipno: trackId, gubun:'link'}), {
      responseType: 'arraybuffer'
    }).then(res => {
      const dom = new JSDOM(iconv.convert(res.data).toString('utf-8'))
      const document = dom.window.document

      const tables = document.querySelectorAll('table')
      const informationTable = tables[1]
      const progressTable = tables[3]

      if(!progressTable) {
        return reject({
          code: 404,
          message: '운송장 정보를 찾을 수 없습니다.',
        })
      }

      return { informationTable, progressTable }
    }).then(({ informationTable, progressTable }) => {
      let shippingInformation = {
        from: {
          name: informationTable.querySelector('input[name=tbSndCustNm]').value,
          time: null,
        },
        to: {
          name: informationTable.querySelector('input[name=tbRcvCustNm]').value,
          time: null,
        },
        state: null,
        progresses: []
      }

      progressTable.querySelectorAll('tr').forEach(element => {
        const td = element.querySelectorAll('td')
        if ( td[0].textContent.trim() == '' ) { return }
        shippingInformation.progresses.push({
          time: td[0].textContent.replace(' ', 'T') + ':00+09:00',
          location: {
            name: td[1].textContent,
          },
          status: parseStatus(td[2].textContent),
          description: tdToDescription(td)
        })
      })

      shippingInformation.state = shippingInformation.progresses[shippingInformation.progresses.length - 1].status

      shippingInformation.from.time = shippingInformation.progresses[0].time
      if(shippingInformation.progresses[shippingInformation.progresses.length - 1].status.id == 'delivered')
        shippingInformation.to.time = shippingInformation.progresses[shippingInformation.progresses.length - 1].time

      resolve(shippingInformation)
    }).catch(err => reject(err))
  })
}

module.exports = {
  info: {
    name: '로젠택배',
    tel: '+8215889988'
  },
  getTrack: getTrack
}
