import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import spawn from 'cross-spawn'
import minimist from 'minimist'
import prompts from 'prompts'
import {
  blue,
  cyan,
  green,
  lightBlue,
  lightGreen,
  lightRed,
  magenta,
  red,
  reset,
  yellow,
} from 'kolorist'

/** 本地调试：模版拷贝进行搭建脚手架
 *  使用 pnpm crate vite ，是如何进行模版创建的？ */

// Avoids autoconversion to number of the project name by defining that the args
// non associated with an option ( _ ) needs to be parsed as a string. See #4606
/** 将 argv._ 中的值都转换为 string 类型
 *  -t, --template <template>  模板
 * _[0] 项目名称
 *
 * -a=1 -b=2 -c3 --abc=4 ===> { _: [], a: 1, b: 2, c: 3, abc: 4 }
 * -t=vue vue-preject ===> { _: ['vue-project'], t: 'vue' }
 * -t -r ===> { _: [], t: true, r: true }
 */
const argv = minimist<{
  t?: string
  template?: string
}>(process.argv.slice(2), { string: ['_'] })
const cwd = process.cwd()

type ColorFunc = (str: string | number) => string
type Framework = {
  name: string
  display: string
  color: ColorFunc
  variants: FrameworkVariant[]
}
type FrameworkVariant = {
  name: string
  display: string
  color: ColorFunc
  customCommand?: string
}

const FRAMEWORKS: Framework[] = [
  {
    name: 'vanilla',
    display: 'Vanilla',
    color: yellow,
    variants: [
      {
        name: 'vanilla-ts',
        display: 'TypeScript',
        color: blue,
      },
      {
        name: 'vanilla',
        display: 'JavaScript',
        color: yellow,
      },
    ],
  },
  {
    name: 'vue',
    display: 'Vue',
    color: green,
    variants: [
      {
        name: 'vue-ts',
        display: 'TypeScript',
        color: blue,
      },
      {
        name: 'vue',
        display: 'JavaScript',
        color: yellow,
      },
      {
        name: 'custom-create-vue',
        display: 'Customize with create-vue ↗',
        color: green,
        customCommand: 'npm create vue@latest TARGET_DIR',
      },
      {
        name: 'custom-nuxt',
        display: 'Nuxt ↗',
        color: lightGreen,
        customCommand: 'npm exec nuxi init TARGET_DIR',
      },
    ],
  },
  {
    name: 'react',
    display: 'React',
    color: cyan,
    variants: [
      {
        name: 'react-ts',
        display: 'TypeScript',
        color: blue,
      },
      {
        name: 'react-swc-ts',
        display: 'TypeScript + SWC',
        color: blue,
      },
      {
        name: 'react',
        display: 'JavaScript',
        color: yellow,
      },
      {
        name: 'react-swc',
        display: 'JavaScript + SWC',
        color: yellow,
      },
    ],
  },
  {
    name: 'preact',
    display: 'Preact',
    color: magenta,
    variants: [
      {
        name: 'preact-ts',
        display: 'TypeScript',
        color: blue,
      },
      {
        name: 'preact',
        display: 'JavaScript',
        color: yellow,
      },
    ],
  },
  {
    name: 'lit',
    display: 'Lit',
    color: lightRed,
    variants: [
      {
        name: 'lit-ts',
        display: 'TypeScript',
        color: blue,
      },
      {
        name: 'lit',
        display: 'JavaScript',
        color: yellow,
      },
    ],
  },
  {
    name: 'svelte',
    display: 'Svelte',
    color: red,
    variants: [
      {
        name: 'svelte-ts',
        display: 'TypeScript',
        color: blue,
      },
      {
        name: 'svelte',
        display: 'JavaScript',
        color: yellow,
      },
      {
        name: 'custom-svelte-kit',
        display: 'SvelteKit ↗',
        color: red,
        customCommand: 'npm create svelte@latest TARGET_DIR',
      },
    ],
  },
  {
    name: 'solid',
    display: 'Solid',
    color: blue,
    variants: [
      {
        name: 'solid-ts',
        display: 'TypeScript',
        color: blue,
      },
      {
        name: 'solid',
        display: 'JavaScript',
        color: yellow,
      },
    ],
  },
  {
    name: 'qwik',
    display: 'Qwik',
    color: lightBlue,
    variants: [
      {
        name: 'qwik-ts',
        display: 'TypeScript',
        color: lightBlue,
      },
      {
        name: 'qwik',
        display: 'JavaScript',
        color: yellow,
      },
      {
        name: 'custom-qwik-city',
        display: 'QwikCity ↗',
        color: lightBlue,
        customCommand: 'npm create qwik@latest basic TARGET_DIR',
      },
    ],
  },
  {
    name: 'others',
    display: 'Others',
    color: reset,
    variants: [
      {
        name: 'create-vite-extra',
        display: 'create-vite-extra ↗',
        color: reset,
        customCommand: 'npm create vite-extra@latest TARGET_DIR',
      },
      {
        name: 'create-electron-vite',
        display: 'create-electron-vite ↗',
        color: reset,
        customCommand: 'npm create electron-vite@latest TARGET_DIR',
      },
    ],
  },
]

// const TEMPLATES = FRAMEWORKS.map(
//   (f) => (f.variants && f.variants.map((v) => v.name)) || [f.name],
// ).reduce((a, b) => a.concat(b), [])

/* 获取模版变体名称 */
const TEMPLATES = FRAMEWORKS.map(
  (f) => (f.variants && f.variants.map((v) => v.name)) || [f.name],
).flat()

const renameFiles: Record<string, string | undefined> = {
  _gitignore: '.gitignore',
}

const defaultTargetDir = 'vite-project'

async function init() {
  const argTargetDir = formatTargetDir(argv._[0])
  const argTemplate = argv.template || argv.t

  let targetDir = argTargetDir || defaultTargetDir

  /** 是 . ， 则返回最后一级目录名 */
  const getProjectName = () =>
    targetDir === '.' ? path.basename(path.resolve()) : targetDir

  let result: prompts.Answers<
    'projectName' | 'overwrite' | 'packageName' | 'framework' | 'variant'
  >

  try {
    result = await prompts(
      [
        {
          type: argTargetDir ? null : 'text', // 没有指定项目名称，则需要输入
          name: 'projectName',
          message: reset('Project name:'),
          initial: defaultTargetDir,
          onState: (state) => {
            targetDir = formatTargetDir(state.value) || defaultTargetDir
          },
        },
        {
          // 如果目标目录不存在，或者目标目录为空，则不需要选择
          type: () =>
            !fs.existsSync(targetDir) || isEmpty(targetDir) ? null : 'select',
          name: 'overwrite',
          message: () =>
            (targetDir === '.'
              ? 'Current directory'
              : `Target directory "${targetDir}"`) +
            ` is not empty. Please choose how to proceed:`,
          initial: 0,
          choices: [
            {
              title: 'Remove existing files and continue',
              value: 'yes',
            },
            {
              title: 'Cancel operation',
              value: 'no',
            },
            {
              title: 'Ignore files and continue',
              value: 'ignore',
            },
          ],
        },
        {
          type: (_, { overwrite }: { overwrite?: string }) => {
            if (overwrite === 'no') {
              throw new Error(red('✖') + ' Operation cancelled')
            }
            return null
          },
          name: 'overwriteChecker',
        },
        {
          /* 验证 package.json -- name 包名是否有效，请求重新输入，并格式化输入 */
          type: () => (isValidPackageName(getProjectName()) ? null : 'text'),
          name: 'packageName',
          message: reset('Package name:'),
          initial: () => toValidPackageName(getProjectName()),
          validate: (dir) =>
            isValidPackageName(dir) || 'Invalid package.json name',
        },
        {
          /* 选框架 */
          type:
            argTemplate && TEMPLATES.includes(argTemplate) ? null : 'select',
          name: 'framework',
          message:
            typeof argTemplate === 'string' && !TEMPLATES.includes(argTemplate)
              ? reset(
                  `"${argTemplate}" isn't a valid template. Please choose from below: `,
                )
              : reset('Select a framework:'),
          initial: 0,
          choices: FRAMEWORKS.map((framework) => {
            const frameworkColor = framework.color
            return {
              title: frameworkColor(framework.display || framework.name),
              value: framework,
            }
          }),
        },
        {
          /** 根据上一步选的框架，选框架中的模版 */
          type: (framework: Framework) =>
            framework && framework.variants ? 'select' : null,
          name: 'variant',
          message: reset('Select a variant:'),
          choices: (framework: Framework) =>
            framework.variants.map((variant) => {
              const variantColor = variant.color
              return {
                title: variantColor(variant.display || variant.name),
                value: variant.name,
              }
            }),
        },
      ],
      {
        onCancel: () => {
          throw new Error(red('✖') + ' Operation cancelled')
        },
      },
    )
  } catch (cancelled: any) {
    console.log(cancelled.message)
    return
  }

  // user choice associated with prompts
  const { framework, overwrite, packageName, variant } = result

  const root = path.join(cwd, targetDir)

  /** 准备目录 */
  if (overwrite === 'yes') {
    emptyDir(root)
  } else if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true })
  }

  // determine template
  let template: string = variant || framework?.name || argTemplate
  let isReactSwc = false
  if (template.includes('-swc')) {
    isReactSwc = true
    template = template.replace('-swc', '')
  }

  const pkgInfo = pkgFromUserAgent(process.env.npm_config_user_agent)
  const pkgManager = pkgInfo ? pkgInfo.name : 'npm'
  const isYarn1 = pkgManager === 'yarn' && pkgInfo?.version.startsWith('1.')

  /* 获取模版对应的自定义命令 */
  const { customCommand } =
    FRAMEWORKS.flatMap((f) => f.variants).find((v) => v.name === template) ?? {}

  if (customCommand) {
    /* 补全各自包管理器对应的命令 */
    const fullCustomCommand = customCommand
      .replace(/^npm create /, () => {
        // `bun create` uses it's own set of templates,
        // the closest alternative is using `bun x` directly on the package
        if (pkgManager === 'bun') {
          return 'bun x create-'
        }
        return `${pkgManager} create `
      })
      // Only Yarn 1.x doesn't support `@version` in the `create` command
      .replace('@latest', () => (isYarn1 ? '' : '@latest'))
      .replace(/^npm exec/, () => {
        // Prefer `pnpm dlx`, `yarn dlx`, or `bun x`
        if (pkgManager === 'pnpm') {
          return 'pnpm dlx'
        }
        if (pkgManager === 'yarn' && !isYarn1) {
          return 'yarn dlx'
        }
        if (pkgManager === 'bun') {
          return 'bun x'
        }
        // Use `npm exec` in all other cases,
        // including Yarn 1.x and other custom npm clients.
        return 'npm exec'
      })

    const [command, ...args] = fullCustomCommand.split(' ')
    // we replace TARGET_DIR here because targetDir may include a space
    const replacedArgs = args.map((arg) => arg.replace('TARGET_DIR', targetDir))
    // 开启子进程执行命令
    const { status } = spawn.sync(command, replacedArgs, {
      stdio: 'inherit', // 子进程的输出流，继承父进程的输出流
    })
    process.exit(status ?? 0)
  }

  console.log(`\nScaffolding project in ${root}...`)

  // 获取模版目录路径
  const templateDir = path.resolve(
    fileURLToPath(import.meta.url),
    '../..',
    `template-${template}`,
  )

  const write = (file: string, content?: string) => {
    const targetPath = path.join(root, renameFiles[file] ?? file)
    if (content) {
      fs.writeFileSync(targetPath, content)
    } else {
      copy(path.join(templateDir, file), targetPath)
    }
  }

  // 读取模版目录下的文件名 和 目录名，循环递归拷贝到目标目录
  const files = fs.readdirSync(templateDir)
  for (const file of files.filter((f) => f !== 'package.json')) {
    write(file)
  }

  const pkg = JSON.parse(
    fs.readFileSync(path.join(templateDir, `package.json`), 'utf-8'),
  )

  pkg.name = packageName || getProjectName()

  write('package.json', JSON.stringify(pkg, null, 2) + '\n')

  if (isReactSwc) {
    setupReactSwc(root, template.endsWith('-ts'))
  }

  const cdProjectName = path.relative(cwd, root)
  console.log(`\nDone. Now run:\n`)
  if (root !== cwd) {
    console.log(
      `  cd ${
        cdProjectName.includes(' ') ? `"${cdProjectName}"` : cdProjectName
      }`,
    )
  }
  switch (pkgManager) {
    case 'yarn':
      console.log('  yarn')
      console.log('  yarn dev')
      break
    default:
      console.log(`  ${pkgManager} install`)
      console.log(`  ${pkgManager} run dev`)
      break
  }
  console.log()
}

/** 去除 空格 和 斜杠 */
function formatTargetDir(targetDir: string | undefined) {
  return targetDir?.trim().replace(/\/+$/g, '')
}

function copy(src: string, dest: string) {
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    copyDir(src, dest)
  } else {
    fs.copyFileSync(src, dest)
  }
}

/** 检验是否为有效 npm 包名 */
function isValidPackageName(projectName: string) {
  return /^(?:@[a-z\d\-*~][a-z\d\-*._~]*\/)?[a-z\d\-~][a-z\d\-._~]*$/.test(
    projectName,
  )
}

/* 转为有效包名 */
function toValidPackageName(projectName: string) {
  return projectName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[._]/, '')
    .replace(/[^a-z\d\-~]+/g, '-')
}

function copyDir(srcDir: string, destDir: string) {
  fs.mkdirSync(destDir, { recursive: true })
  for (const file of fs.readdirSync(srcDir)) {
    const srcFile = path.resolve(srcDir, file)
    const destFile = path.resolve(destDir, file)
    copy(srcFile, destFile)
  }
}

function isEmpty(path: string) {
  const files = fs.readdirSync(path)
  return files.length === 0 || (files.length === 1 && files[0] === '.git')
}

function emptyDir(dir: string) {
  if (!fs.existsSync(dir)) {
    return
  }
  for (const file of fs.readdirSync(dir)) {
    if (file === '.git') {
      continue
    }
    fs.rmSync(path.resolve(dir, file), { recursive: true, force: true })
  }
}

/** 从环境变量的用户代理字符串中提取包名和版本信息  */
function pkgFromUserAgent(userAgent: string | undefined) {
  if (!userAgent) return undefined
  const pkgSpec = userAgent.split(' ')[0]
  const pkgSpecArr = pkgSpec.split('/')
  return {
    name: pkgSpecArr[0],
    version: pkgSpecArr[1],
  }
}

function setupReactSwc(root: string, isTs: boolean) {
  editFile(path.resolve(root, 'package.json'), (content) => {
    return content.replace(
      /"@vitejs\/plugin-react": ".+?"/,
      `"@vitejs/plugin-react-swc": "^3.5.0"`,
    )
  })
  editFile(
    path.resolve(root, `vite.config.${isTs ? 'ts' : 'js'}`),
    (content) => {
      return content.replace('@vitejs/plugin-react', '@vitejs/plugin-react-swc')
    },
  )
}

function editFile(file: string, callback: (content: string) => string) {
  const content = fs.readFileSync(file, 'utf-8')
  fs.writeFileSync(file, callback(content), 'utf-8')
}

init().catch((e) => {
  console.error(e)
})
