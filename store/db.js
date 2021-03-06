import Database from '~/assets/utils/db'
import moment from 'moment'
let db = {}
if (process.browser) {
  db = new Database('pounds', 'fish', 5)
}
export const state = () => ({
  config: {
    syncTime: 5000
  },
  recordCache: [],
  previewContent: null,
  isLoading: false,
  neverLogin: false,
  searchText: ''
})

export const mutations = {
  setSearchText(state, data) {
    state.searchText = data
  },
  setNeverLogin(state, data) {
    state.neverLogin = data
  },
  setIsLoading(state, data) {
    state.isLoading = data
  },
  setPreviewContent(state, data) {
    state.previewContent = data
  },
  setRecordCache(state, data) {
    for (let record of data) {
      state.recordCache.unshift(record)
    }
  },
  putRecordCache(state, data) {
    state.recordCache.forEach((record, index) => {
      if (record.sid === data.sid) {
        state.recordCache.splice(index, 1, data)
        console.log('put')
      }
    })
  },
  resetRecordCache(state, data) {
    state.recordCache = state.recordCache.slice(0, 0)
  }
}

export const actions = {
  async feedStore ({commit}, data) {
    commit('resetRecordCache')
    await db.getAll().then((res) => {
      commit('setRecordCache', res)
    })
  },
  async checkSynchronize ({dispatch, commit, getters, rootGetters}) {
    const { data } = await this.$axios.get('/api/records/count?where={\"teamId\": \"' + rootGetters['user/getTeamSlug'] + '\"}')
    if (getters.recordCount < data.count) {
      await dispatch('downloadRecords')
    } else {
      console.log(getters.recordCount)
      console.log(data.count)
    }
    // await this.$axios.get('/api/records/count?where={"username": "tony@simbo.com.tw"}', records)
  },
  async syncRecords ({commit, dispatch, rootGetters}, data) {
    await db.getByQuery({
      index: 'sync',
      sync: 0
    }).then((records) => {
      if (records.length > 0) {
        this.$axios.post('/api/records/sync', records).then((res) => {
          // 同步成功後把這幾筆改成 synced 或刪除
          let updatedRecords = records.map((a, b) => {
            a.sync = 1
            return a
          })
          db.update(updatedRecords).then((res) => {
            // 與 Store 同步
            for (let item of records) {
              commit('putRecordCache', item)
            }
            setTimeout(() => {
              dispatch('syncRecords')
            }, rootGetters['app/getConfig'].syncTime);
          })
        }).catch((err) => {
          console.log(err)
          setTimeout(() => {
            dispatch('syncRecords')
          }, rootGetters['app/getConfig'].syncTime);
        })
      } else {
        setTimeout(() => {
          dispatch('syncRecords')
        }, rootGetters['app/getConfig'].syncTime);
      }
    })
  },
  async insert({ commit }, data) {
    await db.insert(data).then((result) => {
      commit('setRecordCache', [result])
      commit('setPreviewContent', null)
    })
  },
  async bulkInsert({ commit }, datas) {
    let requests = datas.map((a, b) => {
      return db.insert(a)
    })
    await Promise.all(requests).then((result) => {
      console.log('done')
    }).catch((err) => {
      console.log(err)
    })
  },
  async downloadRecords({ dispatch, rootGetters}) {
    // 如果有 team 同步整個 team or 個人
    let data = {}
    if (rootGetters['user/getTeamSlug'] !== '') {
      data = await this.$axios.get('/api/records?where=%7B%22teamId%22%3A%20%22' + rootGetters['user/getTeamSlug'] + '%22%7D')
    } else {
      data = await this.$axios.get('/api/records?where=%7B%22username%22%3A%20%22' + rootGetters['user/email'] + '%22%7D')
    }
    let records = data.data.map((item, b) => {
      return {
        sid: item.sid,
        category: item.category,
        username: item.username,
        data: item.data,
        deleted: 0,
        sync: 1,
        indexed: 0,
        created: moment(item.created).format('x'),
        public: item.public ? 1 : 0,
        userid: item.publisherId,
        teamid: item.teamId
      }
    })
    await dispatch('bulkInsert', records).then((res) => {
      dispatch('feedStore')
    })
  },
  async resolve({commit}, data) {
    let pattern = /^(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w\.-]+)+[\w\-\._~:/?#[\]@!\$&'\(\)\*\+,;=.]+$/
    if (pattern.test(data)) {
      commit('setIsLoading', true)
      await this.$axios.post('/api/records/resolve', { url: data }).then((res) => {
        commit('setIsLoading', false)
        commit('setPreviewContent', res.data)
      }).catch((err) => {
        commit('setIsLoading', false)
        commit('setPreviewContent', null)
        console.log(err.message)
      })
    } else {
      commit('setIsLoading', false)
      commit('setPreviewContent', null)
      return Promise.reject()
    }
  },
  // async searchRecords ({commit}, text) {
  //   await db.search(state.searchText).then((res) => {
  //     commit('resetRecordCache')
  //     commit('setRecordCache', res)
  //   })
  // },
  async updateRecordCache({ commit }, data) {
    commit('putRecordCache', data)
    await db.put(data)
  }
}
export const getters = {
  getSearchText(state) {
    return state.searchText
  },
  isLoading(state) {
    return state.isLoading
  },
  getPreviewContent(state) {
    return state.previewContent
  },
  getRecordCache(state, getters, rootState, rootGetters) {
    if (state.searchText !== '') {
      // 有搜尋條件時
      return state.recordCache.slice().filter(record => ((record.data || {}).keywords.join().toLowerCase().includes(state.searchText) || ((record.data || {}).title || '').toLowerCase().includes(state.searchText) && record.userid === rootGetters['user/getUserId']))
    } else {
      // 無搜尋條件時
      return state.recordCache.slice().filter(record => record.deleted === 0 && record.userid === rootGetters['user/getUserId'])
    }
  },
  getRecordCacheByTeam(state, getters, rootState, rootGetters) {
    if (state.searchText !== '') {
      // 有搜尋條件時
      console.log(rootGetters['user/getTeamSlug'] + 'QQ')
      return state.recordCache.slice().filter(record => ((record.data || {}).keywords.join().toLowerCase().includes(state.searchText) || ((record.data || {}).title || '').toLowerCase().includes(state.searchText) && record.teamid === rootGetters['user/getTeamSlug']))
    } else {
      // 無搜尋條件時
      console.log(rootGetters['user/getTeamSlug'])
      return state.recordCache.slice().filter(record => record.deleted === 0 && record.teamid === rootGetters['user/getTeamSlug'])
    }
  },
  recordCount (state) {
    return state.recordCache.length
  }
}