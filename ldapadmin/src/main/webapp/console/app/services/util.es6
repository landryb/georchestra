angular.module('admin_console').factory('Util', () => {

  let format = 'YYYY-MM-DD'

  return {

    getDateFromDiff: (interval) => {
      let m = moment()
      if (interval == 'week') {
        m = m.subtract(1, 'weeks')
      }
      if (interval == 'month') {
        m = m.subtract(1, 'months')
      }
      if (interval == '3month') {
        m = m.subtract(3, 'months')
      }
      if (interval == 'year') {
        m = m.subtract(1, 'year')
      }
      return m.format(format)
    },

    getDefaultDate: () => moment().subtract(1, 'year').format(format),

    getDate: () => moment().format(format)

  }

})
