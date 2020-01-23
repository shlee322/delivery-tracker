<template>
  <div id="tracker">
    <b-loading :active.sync="isLoading"></b-loading>
    <header class="column tracking-header">
      <div class="tracking-title">
        <h1 class="has-text-centered">배송조회</h1>
      </div>
      <div class="tracking-status">
        <h1 v-if="error === null" class="has-text-centered">
          {{ info.state.text }}
        </h1>
        <h1 v-else class="has-text-centered">추적실패</h1>
      </div>
      <div class="tracking-illustration has-text-centered">
        <img
          v-if="error === null"
          src="@/assets/nocanvas.png"
          alt="No Canvas"
        />
        <img v-else src="@/assets/nocanvas_failed.png" alt="No Canvas Failed" />
      </div>
      <b-message type="is-danger" v-if="error !== null">
        {{ error.message }}
      </b-message>
    </header>
    <div v-if="error === null" class="tracking-detail">
      <section class="tracking-progresses">
        <transition-group name="fold">
          <div
            v-for="(progressesByDate, date) in progresses"
            :key="date"
            class="tracking-progress-entry"
          >
            <time>{{ beautifyDate(date) }}</time>
            <ul>
              <li v-for="progress in progressesByDate" :key="progress.id">
                <div class="loc">
                  <p>{{ progress.location.name }}</p>
                  <p>{{ getTime(progress.time) }}</p>
                </div>
                <div class="desc">
                  <p>{{ progress.status.text }}</p>
                  <p>{{ progress.description }}</p>
                </div>
              </li>
            </ul>
          </div>
        </transition-group>
        <transition-group v-show="!isProgressTooShort" name="fold">
          <a
            class="fold-button has-text-centered"
            :key="`test1`"
            @click="fold = !fold"
          >
            <div v-if="fold">더보기&nbsp;<i class="fas fa-angle-down"></i></div>
            <div v-else>
              간략히&nbsp;보기&nbsp;<i class="fas fa-angle-up"></i>
            </div>
          </a>
        </transition-group>
        <div v-show="isProgressTooShort" class="fold-button"></div>
      </section>
      <section class="tracking-info">
        <div class="tracking-info-title">
          <h2 class="has-text-centered">기본정보</h2>
        </div>
        <ul>
          <li v-if="info.to.name">
            <h5>받는 사람</h5>
            <p>{{ info.to.name }}</p>
          </li>
          <li>
            <h5>택배사</h5>
            <p>
              {{ carrier.name }} ({{
                formatNumber(carrier.tel, 'International')
              }})
            </p>
          </li>
          <li>
            <h5>송장번호</h5>
            <p>{{ track }}</p>
          </li>
          <li v-if="info.from.name">
            <h5>보낸 사람</h5>
            <p>{{ info.from.name }}</p>
          </li>
        </ul>
      </section>
    </div>
    <div style="margin-top:20px; color: #585858; font-size: 0.8125rem;">
      <a
        class="github-button"
        href="https://github.com/shlee322/delivery-tracker"
        data-icon="octicon-star"
        data-show-count="true"
        aria-label="Star shlee322/delivery-tracker on GitHub"
        >Star</a
      >
      Copyright (C)
      <a href="https://tracker.delivery">https://tracker.delivery</a>
      <script async defer src="https://buttons.github.io/buttons.js"></script>
    </div>
  </div>
</template>

<script>
import { formatNumber } from 'libphonenumber-js';

export default {
  data: () => ({
    carrier: {
      name: '',
      tel: '',
    },
    track: '',
    info: {
      from: { name: '', time: '' },
      to: { name: '', time: '' },
      state: { id: '', text: '' },
      progresses: [],
    },
    progresses: {},
    fold: true,
    isProgressTooShort: false,
    isLoading: true,
    error: null,
  }),
  beforeMount() {
    this.fetchData();
  },
  watch: {
    $route() {
      this.fetchData();
    },
    fold() {
      this.progresses =
        this.fold && !this.isProgressTooShort
          ? this.getProgressesByDate(
              this.info.progresses.slice(this.info.progresses.length - 3)
            )
          : this.getProgressesByDate(this.info.progresses);
    },
  },
  methods: {
    beautifyDate(date) {
      return date.replace(/-/g, '.');
    },
    getTime(isoDate) {
      let time = '';
      try {
        time = new Date(isoDate).toLocaleString('ko-KR', {
          hour: 'numeric',
          minute: 'numeric',
        });
      } catch (error) {
        time = '알 수 없는 시간';
      }
      return time;
    },
    formatNumber,
    fetchData() {
      let carrierName;
      let track;
      try {
        [, carrierName, track] = /#!?\/(\w+.\w+)\/(\d+)/.exec(this.$route.hash);
      } catch (error) {
        this.goGuide();
        return;
      }
      this.isLoading = true;
      this.error = null;

      this.$axios
        .get(`/carriers/${carrierName}/tracks/${track}`)
        .then(res => {
          this.carrier = res.data.carrier;
          this.track = track;
          this.info = res.data;
          return res.data.progresses;
        })
        .then(res => {
          this.isProgressTooShort = res.length <= 3;
          this.progresses = this.getProgressesByDate(
            this.isProgressTooShort ? res : res.slice(res.length - 3)
          );
          this.isLoading = false;
        })
        .catch(err => {
          this.error = {
            statusCode: err.response.status,
            message: err.response.data.message
              ? err.response.data.message
              : '알 수 없는 에러입니다!',
          };
          this.isLoading = false;
        });
    },
    getProgressesByDate(p) {
      const result = {};
      p.slice()
        .sort((a, b) => {
          if (a.time > b.time) {
            return -1;
          }

          if (a.time < b.time) {
            return 1;
          }

          return 0;
        })
        .forEach(progress => {
          const key = progress.time.substr(0, 10);
          if (!(key in result)) {
            result[key] = [];
          }
          result[key].push(progress);
        });
      return result;
    },
    goGuide() {
      window.alert('가이드로 이동합니다.'); // eslint-disable-line no-alert
      this.$router.replace('/guide');
    },
  },
};
</script>

<style lang="scss" scoped>
@import 'bulma/sass/utilities/initial-variables';

$wide-letter-spacing: 0.25rem;

@mixin vertical-center {
  position: relative;
  top: 50%;
  transform: translateY(-50%);
}

.fold-enter-active,
.fold-leave-active {
  transition: display 0.9s, opacity 0.6.5s ease-in-out;
}

.fold-enter, .fold-leave-to /* .fade-leave-active below version 2.1.8 */ {
  opacity: 0;
  display: none;
}

#tracker {
  max-width: $tablet;
  width: 100%;
  margin: 0 auto;
}

.tracking-header {
  width: 100%;
  padding: 0;
  position: relative;
  background-color: #ffffff;

  .tracking-title {
    background-color: #c6c6c6;
    height: 3.75rem;

    h1 {
      @include vertical-center;
      font-size: 1.25rem;
      letter-spacing: $wide-letter-spacing;
      color: #ffffff;
    }
  }

  .tracking-status {
    height: 4.125rem;
    min-height: 4.125rem;
    h1 {
      @include vertical-center;
      font-size: 0.875rem;
      line-height: 1.14;
      letter-spacing: $wide-letter-spacing;
      color: #e24949;
    }
  }
  .tracking-illustration {
    margin-bottom: 2.938rem;
    img {
      width: 88%;
    }
  }

  border-bottom: solid 1px rgba(149, 152, 154, 0.19);
}

.tracking-progresses {
  background-color: #ffffff;
  margin-bottom: 0.4375rem;

  .fold-button {
    display: block;
    height: 2.688rem;
    min-height: 2.688rem;
    margin: 0 1.625rem;
    font-size: 0.875rem;
    line-height: 1.14;
    letter-spacing: $wide-letter-spacing;
    color: #808080;
    div {
      @include vertical-center;
    }
  }

  .tracking-progress-entry {
    padding: 1.625rem;
    padding-bottom: 1.063rem;

    &:last-child {
      padding-bottom: 0;
    }

    time {
      font-size: 0.75rem;
      line-height: 1.17;
      text-align: left;
      color: #585858;
    }

    li {
      display: flex;
      flex-flow: row nowrap;
      padding: 0.875rem 0;
      margin: 0;

      .loc,
      .desc {
        flex-basis: 0;
        p:first-child {
          font-size: 0.8125rem;
          color: #585858;
          padding-bottom: 0.1875rem;
        }
        p:last-child {
          font-size: 0.625rem;
          line-height: 1.1;
          color: #6f6f6f;
        }
      }
      .loc {
        flex-grow: 1;
      }
      .desc {
        flex-grow: 2;
        p {
          text-align: right;
        }
      }
      border-bottom: solid 1px rgba(149, 152, 154, 0.19);
    }
  }
}

.tracking-info {
  background-color: #ffffff;

  .tracking-info-title {
    height: 2.688rem;
    min-height: 2.688rem;
    h2 {
      position: relative;
      top: 50%;
      transform: translateY(-50%);
      font-size: 0.875rem;
      line-height: 1.14;
      letter-spacing: 0.25rem;
      color: #808080;
    }
    border-bottom: solid 1px rgba(149, 152, 154, 0.19);
  }

  ul {
    list-style: none;
    padding: 1.625rem;
    li {
      display: flex;
      flex-flow: row nowrap;
      padding: 0.4375rem 0;

      h5,
      h5 + p {
        display: inline;
        flex-basis: 0;
        font-size: 0.8125rem;
      }

      h5 {
        flex-grow: 1;
        color: #a2a2a2;
      }

      p {
        flex-grow: 2.5;
        color: #585858;
      }
    }
  }
}
</style>
