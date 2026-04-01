import { randomUUID } from "node:crypto";

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { authGuard } from "../middleware/auth.js";
import { nonceGuard } from "../middleware/nonce.js";
import { roleGuard } from "../middleware/role.js";

const questionTypeSchema = z.enum(["numeric_scale", "comment"]);

const createFormSchema = z.object({
  activityId: z.coerce.number().int().positive().optional(),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(1000).optional(),
  questions: z
    .array(
      z.object({
        prompt: z.string().trim().min(1).max(300),
        type: questionTypeSchema,
        required: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(100),
});

const formIdParamsSchema = z.object({
  formId: z.coerce.number().int().positive(),
});

const submissionSchema = z.object({
  responses: z
    .array(
      z.object({
        questionId: z.coerce.number().int().positive(),
        numericValue: z.coerce.number().int().min(1).max(5).optional(),
        commentValue: z.string().max(500).optional(),
      }),
    )
    .min(1)
    .max(500),
});

const receiptParamsSchema = z.object({
  receiptId: z.string().trim().min(12).max(64),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

type FormRow = {
  id: number;
  activity_id: number | null;
  title: string;
  description: string | null;
  is_active: boolean;
  created_by_user_id: number;
  created_at: Date;
};

type QuestionRow = {
  id: number;
  form_id: number;
  prompt: string;
  response_type: "numeric_scale" | "comment";
  is_required: boolean;
  order_index: number;
};

type SubmissionRow = {
  id: number;
  receipt_id: string;
  submitted_at: Date;
};

const evaluationsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/evaluations/forms",
    { preHandler: [authGuard] },
    async (request) => {
      const pagination = paginationSchema.safeParse(request.query);
      if (!pagination.success) {
        throw fastify.httpErrors.badRequest("Invalid pagination query");
      }

      const offset = (pagination.data.page - 1) * pagination.data.limit;
      const dataResult = await fastify.db.query<FormRow>(
        `
          SELECT
            id,
            activity_id,
            title,
            description,
            is_active,
            created_by_user_id,
            created_at
          FROM app.evaluation_forms
          ORDER BY created_at DESC, id DESC
          LIMIT $1 OFFSET $2
        `,
        [pagination.data.limit, offset],
      );

      const totalResult = await fastify.db.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM app.evaluation_forms`,
      );

      return {
        data: dataResult.rows.map((form) => ({
          id: form.id,
          activityId: form.activity_id,
          title: form.title,
          description: form.description,
          isActive: form.is_active,
          createdByUserId: form.created_by_user_id,
          createdAt: form.created_at,
        })),
        total: Number(totalResult.rows[0]?.total ?? "0"),
        page: pagination.data.page,
        limit: pagination.data.limit,
      };
    },
  );

  fastify.post(
    "/evaluations/forms",
    {
      preHandler: [authGuard, roleGuard("program_owner", "admin"), nonceGuard],
    },
    async (request) => {
      const parsed = createFormSchema.safeParse(request.body);
      if (!parsed.success) {
        throw fastify.httpErrors.badRequest("Invalid evaluation form payload");
      }

      const client = await fastify.db.connect();

      try {
        await client.query("BEGIN");

        const insertedForm = await client.query<FormRow>(
          `
            INSERT INTO app.evaluation_forms (
              activity_id,
              title,
              description,
              created_by_user_id
            )
            VALUES ($1, $2, $3, $4)
            RETURNING
              id,
              activity_id,
              title,
              description,
              is_active,
              created_by_user_id,
              created_at
          `,
          [
            parsed.data.activityId ?? null,
            parsed.data.title,
            parsed.data.description ?? null,
            request.auth.userId,
          ],
        );

        const form = insertedForm.rows[0];

        for (let index = 0; index < parsed.data.questions.length; index += 1) {
          const question = parsed.data.questions[index];
          await client.query(
            `
              INSERT INTO app.evaluation_questions (
                form_id,
                prompt,
                response_type,
                is_required,
                order_index,
                min_value,
                max_value
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7)
            `,
            [
              form.id,
              question.prompt,
              question.type,
              question.required,
              index + 1,
              question.type === "numeric_scale" ? 1 : null,
              question.type === "numeric_scale" ? 5 : null,
            ],
          );
        }

        await client.query("COMMIT");

        return {
          id: form.id,
          activityId: form.activity_id,
          title: form.title,
          description: form.description,
          isActive: form.is_active,
          createdByUserId: form.created_by_user_id,
          createdAt: form.created_at,
        };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  );

  fastify.get(
    "/evaluations/forms/:formId",
    { preHandler: [authGuard] },
    async (request) => {
      const params = formIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw fastify.httpErrors.badRequest("Invalid form id");
      }

      const formResult = await fastify.db.query<FormRow>(
        `
          SELECT
            id,
            activity_id,
            title,
            description,
            is_active,
            created_by_user_id,
            created_at
          FROM app.evaluation_forms
          WHERE id = $1
          LIMIT 1
        `,
        [params.data.formId],
      );

      const form = formResult.rows[0];
      if (!form || !form.is_active) {
        throw fastify.httpErrors.notFound("Evaluation form not found");
      }

      const questionsResult = await fastify.db.query<QuestionRow>(
        `
          SELECT
            id,
            form_id,
            prompt,
            response_type,
            is_required,
            order_index
          FROM app.evaluation_questions
          WHERE form_id = $1
          ORDER BY order_index ASC, id ASC
        `,
        [form.id],
      );

      return {
        id: form.id,
        activityId: form.activity_id,
        title: form.title,
        description: form.description,
        questions: questionsResult.rows.map((question) => ({
          id: question.id,
          prompt: question.prompt,
          type: question.response_type,
          required: question.is_required,
          order: question.order_index,
        })),
      };
    },
  );

  fastify.post(
    "/evaluations/forms/:formId/submissions",
    { preHandler: [authGuard, roleGuard("participant"), nonceGuard] },
    async (request) => {
      const params = formIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw fastify.httpErrors.badRequest("Invalid form id");
      }

      const parsedBody = submissionSchema.safeParse(request.body);
      if (!parsedBody.success) {
        throw fastify.httpErrors.badRequest("Invalid submission payload");
      }

      const formResult = await fastify.db.query<FormRow>(
        `
          SELECT
            id,
            activity_id,
            title,
            description,
            is_active,
            created_by_user_id,
            created_at
          FROM app.evaluation_forms
          WHERE id = $1
          LIMIT 1
        `,
        [params.data.formId],
      );

      const form = formResult.rows[0];
      if (!form || !form.is_active) {
        throw fastify.httpErrors.notFound("Evaluation form not found");
      }

      const questionsResult = await fastify.db.query<QuestionRow>(
        `
          SELECT
            id,
            form_id,
            prompt,
            response_type,
            is_required,
            order_index
          FROM app.evaluation_questions
          WHERE form_id = $1
        `,
        [form.id],
      );

      const questions = questionsResult.rows;
      if (questions.length === 0) {
        throw fastify.httpErrors.badRequest("Evaluation form has no questions");
      }

      const byQuestionId = new Map<number, QuestionRow>();
      for (const question of questions) {
        byQuestionId.set(question.id, question);
      }

      const seenResponses = new Set<number>();
      const normalizedResponses: Array<{
        questionId: number;
        type: "numeric_scale" | "comment";
        numericValue: number | null;
        commentValue: string | null;
      }> = [];

      for (const response of parsedBody.data.responses) {
        if (seenResponses.has(response.questionId)) {
          throw fastify.httpErrors.badRequest(
            "Duplicate response for question",
          );
        }
        seenResponses.add(response.questionId);

        const question = byQuestionId.get(response.questionId);
        if (!question) {
          throw fastify.httpErrors.badRequest(
            "Response contains unknown question",
          );
        }

        if (question.response_type === "numeric_scale") {
          if (response.numericValue === undefined) {
            throw fastify.httpErrors.badRequest("Numeric response is required");
          }

          if (response.commentValue !== undefined) {
            throw fastify.httpErrors.badRequest(
              "Comment value is not allowed for numeric question",
            );
          }

          normalizedResponses.push({
            questionId: question.id,
            type: "numeric_scale",
            numericValue: response.numericValue,
            commentValue: null,
          });
          continue;
        }

        if (question.response_type === "comment") {
          if (response.numericValue !== undefined) {
            throw fastify.httpErrors.badRequest(
              "Numeric value is not allowed for comment question",
            );
          }

          const commentValue = response.commentValue?.trim() ?? "";
          if (question.is_required && commentValue.length === 0) {
            throw fastify.httpErrors.badRequest(
              "Required comment question must be answered",
            );
          }

          normalizedResponses.push({
            questionId: question.id,
            type: "comment",
            numericValue: null,
            commentValue: commentValue.length > 0 ? commentValue : null,
          });
          continue;
        }

        throw fastify.httpErrors.badRequest("Unsupported question type");
      }

      for (const question of questions) {
        if (!question.is_required) {
          continue;
        }

        if (!seenResponses.has(question.id)) {
          throw fastify.httpErrors.badRequest(
            "Missing response for required question",
          );
        }
      }

      const receiptId = generateReceiptId();

      const insertedSubmission = await fastify.db.query<SubmissionRow>(
        `
          INSERT INTO app.evaluation_submissions (
            form_id,
            submitted_by_user_id,
            receipt_id,
            answers
          )
          VALUES ($1, $2, $3, $4::jsonb)
          RETURNING id, receipt_id, submitted_at
        `,
        [
          form.id,
          request.auth.userId,
          receiptId,
          JSON.stringify(normalizedResponses),
        ],
      );

      const submission = insertedSubmission.rows[0];

      return {
        submissionId: submission.id,
        receiptId: submission.receipt_id,
        submittedAt: submission.submitted_at,
      };
    },
  );

  fastify.get(
    "/evaluations/submissions/:receiptId",
    { preHandler: [authGuard] },
    async (request) => {
      const params = receiptParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw fastify.httpErrors.badRequest("Invalid receipt id");
      }

      const submissionResult = await fastify.db.query<{
        receipt_id: string;
        form_id: number;
        submitted_at: Date;
      }>(
        `
          SELECT receipt_id, form_id, submitted_at
          FROM app.evaluation_submissions
          WHERE receipt_id = $1
          LIMIT 1
        `,
        [params.data.receiptId],
      );

      const submission = submissionResult.rows[0];
      if (!submission) {
        throw fastify.httpErrors.notFound("Submission not found");
      }

      return {
        receiptId: submission.receipt_id,
        formId: submission.form_id,
        submittedAt: submission.submitted_at,
      };
    },
  );
};

const generateReceiptId = (): string => {
  const stamp = Date.now().toString(36).toUpperCase();
  const token = randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
  return `EVR-${stamp}-${token}`;
};

export default evaluationsRoutes;
