import fs from 'node:fs/promises'
import cliProgress from 'cli-progress'
import { logger } from './log'

import type { IProgress, IProgressItem } from '../types'

export class ProgressBar {
  bookPath: string = ''
  progressFilePath: string = ''
  progressInfo: IProgress = []
  curr: number = 0
  total: number = 0
  isDownloadInterrupted: boolean = false
  bar: cliProgress.SingleBar | null = null
  completePromise: Promise<void> | null = null
  incremental: boolean

  constructor (bookPath: string, total: number, incremental = false) {
    this.bookPath = bookPath
    this.progressFilePath = `${bookPath}/progress.json`
    this.total = total
    this.incremental = incremental
  }

  async init() {
    this.progressInfo = await this.getProgress()
    // 增量下载需把进度重置为0 然后每一篇文档重新检查一遍 update时间
    this.curr = this.incremental ? 0 : this.progressInfo.length
    // 可能出现增量下载
    if (this.curr === this.total) return
    if (this.curr > 0 && this.curr !== this.total && !this.incremental) {
      this.isDownloadInterrupted = true
      logger.info('根据上次数据继续断点下载')
    }

    this.bar = new cliProgress.SingleBar({
      format: 'Download [{bar}] {percentage}% | {value}/{total}',
      // hideCursor: true
    }, cliProgress.Presets.legacy)
    this.bar.start(this.total, this.curr)
  }

  async getProgress(): Promise<IProgress> {
    let progressInfo = []
    try {
      const progressInfoStr = await fs.readFile(this.progressFilePath, {encoding: 'utf8'})
      progressInfo = JSON.parse(progressInfoStr)
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        await fs.writeFile(
          this.progressFilePath,
          JSON.stringify(progressInfo),
          {encoding: 'utf8'}
        )
      }
    }
    return progressInfo
  }

  async updateProgress(progressItem: IProgressItem, isSuccess: boolean) {
    if (this.curr === this.total) return
    this.curr = this.curr + 1
    // 成功才写入 progress.json 以便重新执行时重新下载
    if (isSuccess) {
      const uuid = progressItem.toc.uuid
      // 查找到已有数据则可能是更新文档的内容
      const findProgressItem = this.progressInfo.find(item => item.toc.uuid === uuid)
      if (findProgressItem) {
        // 非深赋值 主要是 时间等字段更新
        Object.assign(findProgressItem, progressItem)
      } else {
        this.progressInfo.push(progressItem)
      }

      await fs.writeFile(
        this.progressFilePath,
        JSON.stringify(this.progressInfo),
        {encoding: 'utf8'}
      )
    }
    if (this.bar) {
      this.bar.update(this.curr)
      if (this.curr >= this.total) {
        this.bar.stop()
        console.log('')
      }
    }
  }
  // 暂停进度条的打印
  pause () {
    if (this.bar) this.bar.stop()
  }
  // 继续进度条的打印
  continue() {
    this.clearLine(2)
    this.bar?.start(this.total, this.curr)
  }
  // 清理n行终端显示
  clearLine(line: number) {
    if (line <= 0) return
    if (typeof process?.stderr?.cursorTo !== 'function') return
    process.stderr.cursorTo(0)
    for (let i = 0; i< line;i++){
      process.stderr.moveCursor(0, -1)
      process.stderr.clearLine(1)
    }
  }
}