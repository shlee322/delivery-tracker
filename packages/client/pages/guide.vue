<template>
  <div id="guide">
    <a href="https://github.com/shlee322/delivery-tracker"
      ><img
        style="position: absolute; top: 0; left: 0; border: 0;"
        src="https://s3.amazonaws.com/github/ribbons/forkme_left_orange_ff7600.png"
        alt="Fork me on GitHub"
    /></a>
    <div class="hero is-medium is-warning">
      <div class="hero-body">
        <h1 class="title">{{ $t('guide.hero.title') }}</h1>
        <h2 class="subtitle">{{ $t('guide.hero.subtitle') }}</h2>
        <p>
          {{ $t('guide.hero.phrase') }}
        </p>
        <div style="margin-top:20px">
          <a
            class="github-button"
            href="https://github.com/shlee322/delivery-tracker"
            data-icon="octicon-star"
            data-size="large"
            data-show-count="true"
            aria-label="Star shlee322/delivery-tracker on GitHub"
            >Star</a
          >
        </div>
        <button class="locale-button" :class="{ 'is-active': $i18n.locale === 'ko' }" v-on:click="$i18n.locale = 'ko'">ko</button>
        <button class="locale-button" :class="{ 'is-active': $i18n.locale === 'en' }" v-on:click="$i18n.locale = 'en'">en</button>
        <button class="locale-button" :class="{ 'is-active': $i18n.locale === 'ja' }" v-on:click="$i18n.locale = 'ja'">ja</button>
      </div>
    </div>
    <div class="content">
      <h1 class="title">{{ $t('guide.content.link.title') }}</h1>
      <p>{{ $t('guide.content.link.phrase') }}</p>
      <pre v-highlightjs><code class="html">
&lt;a href="https://tracker.delivery/#/:carrier_id/:track_id" target="_blank"&gt;배송조회&lt;/a&gt;
      </code></pre>
      <h3 class="title">{{ $t('guide.content.example') }}</h3>
      <b-field>
        <b-select v-model="example.carrier">
          <option value="" selected disabled style="color:#ccc;">{{ $t('guide.content.link.carriers') }}</option>
          <option
            v-for="carrier in carriers"
            :key="carrier.id"
            :value="carrier.id"
            >{{ carrier.name }}</option
          >
        </b-select>
        <b-input type="number" placeholder="송장번호" v-model="example.track" />
        <a @click="openExample()" class="button">{{ $t('guide.content.link.try-example') }}</a>
      </b-field>
      <pre v-highlightjs="exampleHtml"><code class="html"></code></pre>
      <h1 class="title">{{ $t('guide.content.api.title') }}</h1>
      <p>{{ $t('guide.content.api.phrase') }}</p>
      <h3 class="title">{{ $t('guide.content.api.carriers-api') }}</h3>
      <p>
        <span class="tag is-dark">GET</span>
        https://apis.tracker.delivery/carriers
      </p>
      <pre
        v-highlightjs="example.carriers_api_res"
      ><code class="json"></code></pre>
      <h3 class="title">{{ $t('guide.content.api.tracks-api') }}</h3>
      <b-field>
        <b-select v-model="example.carrier">
          <option value="" selected disabled style="color:#ccc;">{{ $t('guide.content.api.carrier') }}</option>
          <option
            v-for="carrier in carriers"
            :key="carrier.id"
            :value="carrier.id"
            >{{ carrier.name }}</option
          >
        </b-select>
        <b-input type="number" placeholder="송장번호" v-model="example.track" />
      </b-field>
      <p>
        <span class="tag is-dark">GET</span>
        https://apis.tracker.delivery/carriers/:carrier_id/tracks/:track_id
      </p>
      <p>
        <span class="tag">Example</span> https://apis.tracker.delivery/carriers/{{
          example.carrier
        }}/tracks/{{ example.track }}
      </p>
      <pre
        style="white-space:pre-wrap;"
        v-highlightjs="example.track_api_res"
      ><code class="json"></code></pre>

      <h1 class="title">{{ $t('guide.content.support.carrier') }}</h1>
      <table v-if="carriers.length !== 0">
        <thead>
          <tr>
            <th>{{ $t('guide.content.support.name') }}</th>
            <th>{{ $t('guide.content.support.code') }}</th>
          </tr>
        </thead>
        <tbody v-for="carrier in carriers" :key="carrier.id">
          <tr>
            <td>{{ carrier.name }}</td>
            <td>{{ carrier.id }}</td>
          </tr>
        </tbody>
      </table>

      <h1 class="title">Sponsorship (Enterprise)</h1>
      <p>{{ $t('guide.sponsorship') }}: <a href="mailto:contact@tracker.delivery">contact@tracker.delivery</a></p>
    </div>
    <footer class="footer">
      <p>
        {{ $t('guide.footer') }}: <a href="https://github.com/shlee322/delivery-tracker/issues" target="_blank" >Github</a>
      </p>
    </footer>
    <b-modal :active.sync="isExampleOpened">
      <iframe
        :src="exampleUrl"
        style="height: 100%;width: 100%; min-width: 320px; min-height: 480px"
      ></iframe>
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
      track_api_res: 'Loading...',
    },
  }),
  beforeMount() {
    this.fetchData();
    this.updateTrackExample();
  },
  watch: {
    $route() {
      this.fetchData();
      this.updateTrackExample();
    },
    exampleUrl() {
      this.updateTrackExample();
    },
  },
  computed: {
    exampleUrl() {
      return `/#/${this.example.carrier}/${this.example.track}`;
    },
    exampleHtml() {
      return `<a href="https://tracker.delivery/#/${this.example.carrier}/${this.example.track}" target="_blank">배송조회</a>`;
    },
  },
  methods: {
    openExample() {
      const isCorrect =
        /([a-z]{2})\.([a-z0-9]+)/g.test(this.example.carrier) &&
        /(\d{10,})/g.test(this.example.track);

      if (!isCorrect) {
        this.$toast.open({
          duration: 2000,
          message: '올바르지 않은 송장번호입니다!',
          type: 'is-danger',
        });

        return;
      }

      this.isExampleOpened = isCorrect;
    },
    fetchData() {
      this.$axios
        .get('/carriers')
        .then(res => {
          this.carriers = res.data;
          this.example.carriers_api_res = JSON.stringify(res.data, null, '   ');
        })
        .catch(() => {
          this.carriers = [];
        });
    },
    updateTrackExample() {
      this.example.track_api_res = 'Loading...';

      this.$axios
        .get(`/carriers/${this.example.carrier}/tracks/${this.example.track}`)
        .then(res => {
          this.example.track_api_res = JSON.stringify(res.data, null, '   ');
        })
        .catch(err => {
          this.example.track_api_res = JSON.stringify(
            err.response.data,
            null,
            '   '
          );
        });
    },
  },
};
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

.locale-button {
    background-color: #292b2c;
    border: 0;
    color: #FFFFFF;
    cursor: pointer;
    outline: none;
    padding: 5px 10px;
    transition: background-color .5s ease-in-out;

    &:hover {
        background-color: #0275d8;
    }

    &.is-active {
        background-color: #0275d8;
    }
}
</style>
