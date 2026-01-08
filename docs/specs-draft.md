#STCAPI — Draft Specification (Tier 1 / MVP)

**STC** — отсылка к *Standard Template Component* из Warhammer.

## Цель проекта

Цель проекта — предоставить спецификации и базовые инструменты для быстрой разработки проектов (прежде всего на TS/JS), понятные как человеку, так и AI-агентам.

Основной упор делается на абстрактные, **vendor-agnostic** протоколы взаимодействия, при этом удачные подходы конкретных вендоров поощряются к использованию и переосмыслению.

Проект нацелен на то, чтобы вобрать в себя наиболее оправдавшие себя подходы к разработке, а также предоставить инструменты, которые:
- просты для начала использования;
- обладают большим потенциалом при дальнейшем развитии проектов.

На данном этапе мы должны сосредоточиться **на спецификации**, а не на конкретной реализации.

---

## Принципы именования

При разработке спецификации мы тщательно выбираем имена методов, интерфейсов, типов и полей, стараясь давать названия, которые оцениваются по следующим параметрам:

- принято в индустрии;
- отражает суть;
- короткое;
- не вводит путаницу, ассоциируясь с другими технологиями.

При выборе конечного названия мы **всегда приводим список альтернатив**, из которых можно сделать обоснованный вывод.

---

## Расширяемость спецификации

Спецификация должна быть расширяемой и может содержать **proposal-части** (экспериментальные или обсуждаемые элементы).

Мы будем стараться описывать спецификацию в виде `.d.ts` файлов с комментариями в формате **TSDoc**.

---

## Компоненты

### Core components

- appEngine (workbench-light)
- module
- collection
- chat  
  - ChatMessage
- api  
  - ApiCallResult
- apiClient
- channel
- transport  
  (http / ws / ipc / stdin / graphql / rpc / trpc / grpc / mcp)
- storage  
  (fs / db / s3)
- agent
- docs  
  (JSON Schema / DTS / OpenAPI / AsyncAPI)
- policy

### Extended components

- IssueTracker

---

## Collection (STCCollection)

Коллекция представляет собой набор записей, у которых есть уникальный ключ.

Коллекция может иметь несколько типов:

- **flat** — между записями нет жёстких связей;
- **tree** — допускаются иерархические связи между записями;
- **ugraph** — допускаются записи со связями, в которых возможны циклы (unidirectional graph);
- **mgraph** *(proposal)* — допускается множество связей у каждой записи, при этом связи могут быть направленными или ненаправленными.

На первом этапе необходимо реализовать работу с **in-memory коллекциями** и метод `query` у коллекции с использованием библиотеки **mingo**.

---

## Channel (STCChannel)

Абстракция над каналом передачи данных.

Для конкретного пользователя канал имеет свойства (или методы):
- `canRead`
- `canWrite`

Данные могут передаваться в следующих форматах:
- JSON
- BSON *(proposal)*
- binary *(proposal — требуется сравнение с BSON перед реализацией)*

Канал может иметь конечное или бесконечное время жизни.

Помимо передачи произвольных данных, в канал могут приходить **системные сообщения**, информирующие:
- об изменении параметров канала;
- о сигнале закрытия.

На каналы можно подписываться и запрашивать их параметры.

---

## DB

Компонент, позволяющий создавать и изменять коллекции.

---

## Chat (STCChat)

Чат выделяется как **core-компонент**, поскольку он является важной частью системы.  
Например, AI-агенты используют чаты для рассуждений и коммуникаций.

Чат рассматривается как `Collection`, где:
- порядок записей имеет значение;
- каждая запись содержит `body` — основной контент.

Понятие чата очень широкое. К нему относятся:
- обсуждения issue или PR в GitHub;
- комментарии к видео на YouTube;
- новостные фиды компании;
- логи;
- текстовые транскрипты видео.

Внутри чат агрегирует:
- **channel** — для подписки на обновления;
- **collection** — для работы с коллекцией сообщений.

---

## AppEngine

Компонент для сборки приложения из модулей и предоставления документации.

На текущий момент уже разработана первая версия — **workbench-light**.

Ниже приведён пример приложения с одним корневым модулем и подмодулями.

### app.ts (root module)

```ts
import { z } from "zod";
import { module, query } from "./workbench-light";
import { issueTracker } from "./issueTracker";

const app = module((ctx) => ({
  api: {
    appMethod2: query(
      z.undefined().meta({
        description: "No input parameters",
      }),
      z.number().int().meta({
        description: "Returns the ultimate answer",
      }),
      async () => 42,
      {
        description: "Returns the answer to life, the universe, and everything",
      }
    ),

    issueTracker,
  },
})).activate();

console.dir(app.getApiSchema(), { depth: 20 });

(async () => {
  console.log(await app.appMethod2(undefined));
  console.log(await app.issueTracker.getTasks({ q: "bug" }));

  // teardown
  app.dispose();
})();

Здесь:
	•	query(..., meta) — описание эндпойнта целиком;
	•	.meta({ description }) на Zod — описание input/output типов;
	•	CLI и docs могут извлекать:
	•	описание команды — из query.meta.description;
	•	описание аргументов — из inputSchema.shape[key].meta()?.description.

⸻

issueTracker.ts (модуль)

import { z } from "zod";
import { module, query } from "./workbench-light";

export const issueTracker = module((ctx) => {
  // private (реально private)
  let counter = 0;

  ctx.onInit(() => {
    ctx.events.sub("tick", () => {
      counter += 1;
    });
  });

  return {
    api: {
      getTasks: query(
        z
          .object({
            q: z
              .string()
              .optional()
              .meta({
                description: "Free-text search query",
              }),
          })
          .optional()
          .meta({
            description: "Task list query parameters",
          }),

        z
          .array(
            z.object({
              id: z.string().meta({
                description: "Task identifier",
              }),
              title: z.string().meta({
                description: "Human-readable task title",
              }),
            })
          )
          .meta({
            description: "List of tasks",
          }),

        async (input) => [
          {
            id: String(counter),
            title: input?.q ?? "Task",
          },
        ],

        {
          description: "Fetches tasks from the issue tracker",
          grade: "IssueTrackerG1",
        }
      ),
    },
  };
});


⸻

getApiSchema (логическая структура)

{
  appMethod2: {
    kind: "query",
    meta: {
      description: "Returns the answer to life, the universe, and everything"
    },
    input: ZodUndefined { meta: { description: "No input parameters" } },
    output: ZodNumber { meta: { description: "Returns the ultimate answer" } }
  },
  issueTracker: {
    getTasks: {
      kind: "query",
      meta: {
        description: "Fetches tasks from the issue tracker",
        grade: "IssueTrackerG1"
      },
      input: ZodObject {
        shape: {
          q: ZodOptional {
            meta: { description: "Free-text search query" }
          }
        },
        meta: { description: "Task list query parameters" }
      },
      output: ZodArray {
        element: ZodObject {
          shape: {
            id: ZodString { meta: { description: "Task identifier" } },
            title: ZodString { meta: { description: "Human-readable task title" } }
          }
        },
        meta: { description: "List of tasks" }
      }
    }
  }
}


⸻

ApiClient (STCAPIClient)

Когда создаётся приложение в системе STCAPI, его компоненты могут находиться как локально, так и удалённо. Однако для унификации мы всегда работаем с ними так, как будто они удалённые.

Любой публичный метод при вызове сразу возвращает объект CallRequest, который содержит обязательные и необязательные поля.

Предполагается, что такой запрос создаёт channel с конечным временем жизни.

API хранит ссылку на этот channel в collection до завершения его работы.

CallRequest
	•	requestId — уникальный идентификатор запроса (возможно, channelId);
	•	channel — канал, на который можно подписаться;
	•	promise — промис, который resolve/reject по завершении запроса значением типа CallResult;
	•	syncResult? (proposal) — если результат получен синхронно, он может быть доступен здесь.

Жизненный цикл вызова

Если выполняется удалённый вызов метода, и документация подразумевает синхронный или асинхронный ответ, в channel приходит 4 события:
	1.	запрос отправлен;
	2.	получатель подтвердил получение запроса;
	3.	получатель прислал ответ;
	4.	канал закрыт с кодом codeId
(возможно, стоит объединить с сообщением о закрытии).

Также возможны сценарии, когда до закрытия канала приходит множество промежуточных сообщений:
	•	стриминг ответа AI-агента;
	•	загрузка HTML-документа чанками.

В случае HTTP отдельной обработки может требовать OPTIONS.

Ошибки и тайм-ауты

Неудачные сценарии:
	•	тайм-аут со стороны сервера;
	•	тайм-аут со стороны клиента.

При клиентском тайм-ауте клиент должен попытаться уведомить сервер.

Также необходим механизм отмены задачи на стороне сервера по запросу клиента.

Loglevel и стриминг

Клиент должен уметь выбирать logLevel для длительных запросов:
	•	ничего не получать;
	•	получить только итоговый ответ;
	•	получить полный лог и call stack при ошибке.

Необходимо определить, как в описании модуля указывать поддержку стриминга.

System progress message

Допускается, что в channel могут приходить системные сообщения типа progress:

{
  status?: "queued" | "processing";
  progress?: number; // 0..1
  stageCode?;
  stageTitle?;
  substageCode?;
  subStageTitle?;
  metrics?: {
    cpu?;
    mem?;
    processes?;
    io?;
    network?;
  };
}

Полнота progress зависит от выбранного logLevel.

CallResult

CallResult должен рекомендовать указывать код ошибки при неудаче.
На первом этапе поддерживаются HTTP-коды и коды завершения процесса.

Буферизация

По умолчанию у клиента и сервера включена буферизация сообщений channel (100 ms),
что особенно полезно в web-клиентах для уменьшения количества перерендеров.

⸻

Transport (STCTransport)

При подключении к удалённому приложению apiClient использует один из транспортов, определяющих протокол взаимодействия:
	•	http
	•	ws
	•	ipc
	•	stdin
	•	graphql
	•	rpc
	•	trpc
	•	grpc
	•	rest

На первом этапе необходимо поддержать RPC и REST, а также передачу данных по:
	•	https
	•	ws
	•	ipc
	•	stdio
	•	sse

В браузере доступны только:
	•	https
	•	ws
	•	sse

⸻

ApiHost

На стороне сервера настраивается ApiHost с доступными вариантами коммуникации.

По умолчанию открывается доступ по stdio для вызова API через CLI-клиент.

⸻

Policy и реестры политик

Приложение может поставляться с набором политик, обычно в виде .md файлов.

Каждая политика должна быть понятна как человеку, так и AI-агенту.

При запуске CLI-приложения политики загружаются из docs/policy/*.md в collection.

Политики могут содержать:
	•	примеры кода;
	•	правила именования;
	•	преобразования данных;
	•	соглашения по БД.

Идентификатор политики

Формат:

R.S.SS.v.v.v

Где:
	•	R — реестр политик (обычно один на репозиторий или группу репозиториев);
	•	S — номер раздела;
	•	SS — подраздел (если есть, строчная буква);
	•	v.v.v — версия/издание.

Для активированных политик (proposal):

R.S.v.v.v-P

Где P — набор флагов (например, STRICT).

В реестре политик должен существовать index с оглавлением.

⸻

Пример политики

При разработке спецификации мы тщательно выбираем имена методов, интерфейсов, типов и полей, оценивая их по следующим параметрам:
	•	принято в индустрии;
	•	отражает суть;
	•	короткое;
	•	не вводит путаницу.

Для каждого финального названия приводится таблица альтернатив:

Name	Pros	Cons	Notes	Rating


Rating — оценки по 5-балльной шкале для каждого критерия + общий 
