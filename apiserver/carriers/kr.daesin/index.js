const axios = require('axios')
const iconv  = new (require('iconv').Iconv)('EUC-KR', 'UTF-8//TRANSLIT//IGNORE')
const { JSDOM } = require('jsdom')
const qs = require('querystring')

function getTrack(trackId) {
  const trimString = (s) => {
    return s.replace(/([\n\t]{1,}|\s{2,})/g, ' ').trim()
  }

  return new Promise((resolve, reject) => {
    axios.post('https://www.ds3211.co.kr/freight/internalFreightSearch.ht', qs.stringify({
      billno: trackId,
      sf: ''
    }), {
      responseType: 'arraybuffer'
    }).then(res => {
      const dom = new JSDOM(iconv.convert(res.data).toString('utf-8'))
      const document = dom.window.document

      const tables = document.querySelectorAll('tbody')

      if(tables.length === 0) {
        return reject({
          code: 404,
          message: trimString(document.querySelector('.effect').textContent)
        })
      }

      return {
        info: tables[0].querySelectorAll('td'),
        progresses: tables[1].querySelectorAll('tr:not(:first-child)')
      }
    }).then(({ info, progresses }) => {
      let shippingInformation = {
        from: {
          name: trimString(info[0].textContent),
          tel: trimString(info[1].textContent)
        },
        to: {
          name: trimString(info[2].textContent),
          tel: trimString(info[3].textContent)
        },
        item: trimString(info[4].textContent),
        state: { id: 'information_received', text:'접수' },
        progresses: [],
      }

      progresses.forEach(element => {
        const tds = element.querySelectorAll('td')

        shippingInformation.progresses.push({
          time: `${tds[3].textContent.replace(' ', 'T')}:00+09:00`,
          location: {
            name: trimString(tds[1].textContent)
          },
          description: `연락처: ${trimString(tds[2].textContent)}`,
          status: { id: 'in_transit', text: '배송중' }
        })

        if(!tds[4].textContent) return;

        shippingInformation.progresses.push({
          time: `${tds[4].textContent.replace(' ', 'T')}:00+09:00`,
          location: {
            name: trimString(tds[1].textContent)
          },
          description: `연락처: ${trimString(tds[2].textContent)}`,
          status: tds[5].textContent.indexOf('배송완료') !== -1 ? { id: 'delivered', text: '배송완료' } : { id: 'in_transit', text: '배송중' }
        })
      })

      const lastProgress = shippingInformation.progresses[shippingInformation.progresses.length - 1]
      if(lastProgress) {
        shippingInformation.state = lastProgress.status
        if(lastProgress.status.id === 'delivered') shippingInformation.to.time = lastProgress.time
      }

      resolve(shippingInformation)
    }).catch(err => reject(err))
  })
}

module.exports = {
  info: {
    name: '대신택배',
    tel: '+82314620100'
  },
  getTrack: getTrack
}
