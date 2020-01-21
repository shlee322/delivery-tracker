<template>
  <div id="guide">
    <a href="https://github.com/shlee322/delivery-tracker"><img style="position: absolute; top: 0; left: 0; border: 0;" src="https://s3.amazonaws.com/github/ribbons/forkme_left_orange_ff7600.png" alt="Fork me on GitHub"></a>
    <div class="hero is-medium is-warning">
      <div class="hero-body">
        <h1 class="title">Delivery Tracker - 배송 조회 API 서비스</h1>
        <h2 class="subtitle">쇼핑몰 개발 시 배송 조회 개발하기 귀찮으셨죠?</h2>
        <p>이제 이 서비스를 이용하여 쉽고 간편하게 배송조회 기능을 만들어보세요.</p>
        <div style="margin-top:20px"><a class="github-button" href="https://github.com/shlee322/delivery-tracker" data-icon="octicon-star" data-size="large" data-show-count="true" aria-label="Star shlee322/delivery-tracker on GitHub">Star</a></div>
      </div>
    </div>
    <div class="content">
      <h1 class="title">링크형</h1>
       <p>배송조회 페이지를 팝업 형태를 띄우고 싶다면 아래와 같은 방식으로 코드를 넣으시면 됩니다.</p>
      <pre v-highlightjs><code class="html">
&lt;a href="https://tracker.delivery/#/:carrier_id/:track_id" target="_blank"&gt;배송조회&lt;/a&gt;
      </code></pre>
      <h3 class="title">예제</h3>
      <b-field>
        <b-select v-model="example.carrier">
          <option value="" selected disabled style="color:#ccc;">택배사</option>
          <option v-for="carrier in carriers" :key="carrier.id" :value="carrier.id">{{ carrier.name }}</option>
        </b-select>
        <b-input type="number" placeholder="송장번호" v-model="example.track"/>
        <a @click="openExample()" class="button">예제 보기</a>
      </b-field>
      <pre v-highlightjs="exampleHtml"><code class="html"></code></pre>
      <h1 class="title">API형</h1>
      <p>제공되는 웹 페이지를 이용하지 않고 Restful API에 직접 접근하여 데이터를 가져올 수 있습니다.</p>
      <h3 class="title">택배사 목록 조회 API</h3>
      <p><span class="tag is-dark">GET</span> https://apis.tracker.delivery/carriers</p>
      <pre v-highlightjs="example.carriers_api_res"><code class="json"></code></pre>
      <h3 class="title">배송 조회 API</h3>
      <b-field>
        <b-select v-model="example.carrier">
          <option value="" selected disabled style="color:#ccc;">택배사</option>
          <option v-for="carrier in carriers" :key="carrier.id" :value="carrier.id">{{ carrier.name }}</option>
        </b-select>
        <b-input type="number" placeholder="송장번호" v-model="example.track"/>
      </b-field>
      <p><span class="tag is-dark">GET</span> https://apis.tracker.delivery/carriers/:carrier_id/tracks/:track_id</p>
      <p><span class="tag">예제</span> https://apis.tracker.delivery/carriers/{{ example.carrier }}/tracks/{{ example.track }}</p>
      <pre style="white-space:pre-wrap;" v-highlightjs="example.track_api_res"><code class="json"></code></pre>

      <h1 class="title">지원 택배사</h1>
      <table>
        <thead>
          <tr>
            <th>이름</th>
            <th>코드</th>
          </tr>
        </thead>
        <tbody v-if="carrier.length !== 0" v-for="carrier in carriers" :key="carrier.id">
          <tr>
            <td>{{ carrier.name }}</td>
            <td>{{ carrier.id }}</td>
          </tr>
        </tbody>
      </table>

      <h1 class="title">Sponsorship (Enterprise)</h1>
      <p>스폰서에게 Webhook과 기술 지원 등의 추가 기능을 제공하고 있습니다. 자세한 내용은 <a href="mailto:contact@tracker.delivery">contact@tracker.delivery</a>로 문의 부탁드립니다.</p>
    </div>
    <footer class="footer">
      <p>택배사 추가 요청 등 문의는 <a href="https://github.com/shlee322/delivery-tracker/issues" target="_blank">Github</a>로 주시기 바랍니다.</p>
    </footer>
    <b-modal :active.sync="isExampleOpened">
      <iframe :src="exampleUrl" style="height: 100%;width: 100%; min-width: 320px; min-height: 480px"></iframe>
    </b-modal>
    <script async defer src="https://buttons.github.io/buttons.js"></script>
  </div>
</template>

<script>
export default {
  data: () => ({
    carriers: [],
    isExampleOpened: false,
    example: {
      carrier: 'kr.epost',
      track: '1111111111111',
      carriers_api_res: 'Loading...',
      track_api_res: 'Loading...'
    },
  }),
  beforeMount() {
    this.fetchData()
    this.updateTrackExample()
  },
  watch: {
    $route() {
      this.fetchData()
      this.updateTrackExample()
    },
    exampleUrl() {
      this.updateTrackExample()
    }
  },
  computed: {
    exampleUrl() {
      return `https://tracker.delivery/#/${this.example.carrier}/${this.example.track}`
    },
    exampleHtml() {
      return `<a href="https://tracker.delivery/#/${this.example.carrier}/${this.example.track}" target="_blank">배송조회</a>`
    }
  },
  methods: {
    openExample() {
      let isCorrect = /([a-z]{2})\.([a-z0-9]+)/g.test(this.example.carrier) && /(\d{10,})/g.test(this.example.track)

      if ( !isCorrect ) {
        this.$toast.open({
          duration: 2000,
          message: '올바르지 않은 송장번호입니다!',
          type: 'is-danger',
        })

        return
      }

      this.isExampleOpened = isCorrect
    },
    fetchData() {
      this.$axios
        .get('/carriers')
        .then(res => {
          this.carriers = res.data
          this.example.carriers_api_res = JSON.stringify(res.data, null, '   ')
        })
        .catch(res => (this.carriers = []))
    },
    updateTrackExample() {
      this.example.track_api_res = 'Loading...'

      this.$axios
        .get(`/carriers/${this.example.carrier}/tracks/${this.example.track}`)
        .then(res => {
          this.example.track_api_res = JSON.stringify(res.data, null, '   ')
        })
        .catch(err => {
          this.example.track_api_res = JSON.stringify(err.response.data, null, '   ')
        })
    }
  }
}
</script>

<style lang="scss">
@import 'highlight.js/styles/github-gist';
</style>

<style lang="scss" scoped>
@import 'bulma/sass/utilities/initial-variables';

#guide {
  max-width: $desktop;
  margin: 0 auto;
  background-color: #ffffff;
  border-left: solid 1px rgba(149, 152, 154, 0.19);
  border-right: solid 1px rgba(149, 152, 154, 0.19);
}

.hero-body {
  padding: 9rem 4rem;
}

.content {
  padding: 4rem;
}
</style>
