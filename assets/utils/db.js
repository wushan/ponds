import moment from 'moment'
import short from 'short-uuid'
export default class Database {
  constructor(database, table, version) {
    this.name = database
    this.objectStoreName = table
    this.version = version
    this.db = {}
  }
  init() {
    return new Promise((resolve, reject) => {
      var indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.msIndexedDB
      var request = indexedDB.open(this.name, this.version)
      request.onsuccess = (evt) => {
        // 將db暫存起來供以後操作
        this.db = request.result
        resolve()
      }

      request.onerror = (evt) => {
        console.log('IndexedDB error: ' + evt.target.errorCode)
        reject(evt.target.errorCode)
      }

      request.onupgradeneeded = (evt) => {
        var objectStore = {}
        if (evt.oldVersion < 1) {
          this.createDB(evt, objectStore)
        } else {
          // 清除 DB 重建
          evt.currentTarget.result.deleteObjectStore(this.objectStoreName)
          this.createDB(evt, objectStore)
        }
      }
    })
  }
  createDB (evt, objectStore) {
    objectStore = evt.currentTarget.result.createObjectStore(this.objectStoreName, {
      // 主 KEY
      keyPath: 'sid', autoIncrement: false, unique: true
    })
    objectStore.createIndex('sid', 'sid', { unique: true })
    objectStore.createIndex('category', 'category', { unique: false })
    objectStore.createIndex('username', 'username', { unique: false })
    objectStore.createIndex('data', 'data', { unique: false })
    objectStore.createIndex('sync', 'sync', { unique: false })
    objectStore.createIndex('indexed', 'indexed', { unique: false })
    objectStore.createIndex('created', 'created', { unique: false })
    objectStore.createIndex('deleted', 'deleted', { unique: false })
    objectStore.createIndex('public', 'public', { unique: false })
    objectStore.createIndex('userid', 'userid', { unique: false })
    objectStore.createIndex('teamid', 'teamid', { unique: false })
  }
  insert(data) {
    return new Promise((resolve, reject) => {
      this.init().then(() => {
        // 利用 this.db 取得 db 連線
        var transaction = this.db.transaction(this.objectStoreName, 'readwrite')
        var objectStore = transaction.objectStore(this.objectStoreName)
        var request = objectStore.put(data)
        request.onsuccess = function (evt) {
          resolve(data)
        }
        request.onerror = function (evt) {
          reject(evt)
        }
      }).catch((err) => {
        console.log(err)
      })
    })
  }
  update(records) {
    return new Promise((resolve, reject) => {
      let requests = []
      records.forEach((val, index) => {
        if (val.deleted === 1) {
          requests.push(this.removeRecord(val))
        } else {
          requests.push(this.put(val))
        }
      })
      Promise.all(requests).then((res) => {
        resolve(requests.length)
      }).catch((err) => {
        reject(err)
      })
    })
  }
  removeRecord(record) {
    return new Promise((resolve, reject) => {
      this.init().then(() => {
        // 利用 this.db 取得 db 連線
        var transaction = this.db.transaction(this.objectStoreName, 'readwrite')
        var objectStore = transaction.objectStore(this.objectStoreName)
        var request = objectStore.delete(record.sid)
        request.onsuccess = function (evt) {
          resolve()
        }
        request.onerror = function (evt) {
          reject(evt)
        }
      })
    })
  }
  put(record) {
    return new Promise((resolve, reject) => {
      this.init().then(() => {
        // 利用 this.db 取得 db 連線
        var transaction = this.db.transaction(this.objectStoreName, 'readwrite')
        var objectStore = transaction.objectStore(this.objectStoreName)
        var request = objectStore.put(record)
        request.onsuccess = function (evt) {
          resolve()
        }
        request.onerror = function (evt) {
          reject(evt)
        }
      })
    })
  }
  getAll () {
    return new Promise((resolve, reject) => {
      // if (limit === undefined) {
      //   limit = 5
      // }
      this.init().then(() => {
        var transaction = this.db.transaction(this.objectStoreName, 'readwrite')
        var objectStore = transaction.objectStore(this.objectStoreName)
        objectStore = objectStore.index('deleted')
        var request = objectStore.getAll(IDBKeyRange.upperBound(1, true))
        request.onsuccess = function (evt) {
          let result = evt.target.result.sort((a, b) => {
            return a.created - b.created
          })
          resolve(result)
        }
      })
    })
  }
  getByQuery(query, limit) {
    return new Promise((resolve, reject) => {
      if (limit === undefined) {
        limit = 5
      }
      this.init().then(() => {
        let transaction = this.db.transaction(this.objectStoreName, 'readonly')
        let objectStore = transaction.objectStore(this.objectStoreName)
        objectStore = objectStore.index(query.index)
        let request = objectStore.openCursor(IDBKeyRange.only(query[query.index]), IDBCursor.NEXT)
        let results = []
        request.onsuccess = function (evt) {
          var cursor = evt.target.result
          if (cursor && results.length < limit) {
            results.push(cursor.value)
            cursor.continue()
          } else {
            resolve(results)
          }
        }
      })
    })
  }
  get(from, to, limit) {
    return new Promise((resolve, reject) => {
      if (limit === undefined) {
        limit = 5
      }
      this.init().then(() => {
        var transaction = this.db.transaction(this.objectStoreName, 'readwrite')
        var objectStore = transaction.objectStore(this.objectStoreName)
        objectStore = objectStore.index('time')
        var request = objectStore.openCursor(IDBKeyRange.bound(from, to), IDBCursor.NEXT)
        let results = []
        request.onsuccess = function (evt) {
          var cursor = evt.target.result
          if (cursor && results.length < limit) {
            if (cursor.value.uploaded !== 'true') {
              results.push(cursor.value)
            }
            cursor.continue()
          } else {
            resolve(results)
          }
        }
      })
    })
  }
  search (keyword, limit) {
    return new Promise((resolve, reject) => {
      if (limit === undefined) {
        limit = 5
      }
      this.init().then(() => {
        var transaction = this.db.transaction(this.objectStoreName, 'readonly')
        var objectStore = transaction.objectStore(this.objectStoreName)
        // objectStore = objectStore.index('time')
        var request = objectStore.openCursor()
        let results = []
        request.onsuccess = function (evt) {
          var cursor = evt.target.result
          if (cursor) {
            let kw = ((cursor.value.data || {}).keywords || [])
            let title = ((cursor.value.data || {}).title || '')
            if (kw.join().toLowerCase().includes(keyword.toLowerCase()) || title.toLowerCase().includes(keyword.toLowerCase())) {
              results.push(cursor.value)
            }
            cursor.continue()
          } else {
            resolve(results)
          }
        }
      })
    })
  }
}
