const express = require("express");
const bodyParser = require("body-parser");
const { sequelize } = require("./model");
const { Op } = require("sequelize");
const { getProfile } = require("./middleware/getProfile");
const app = express();
app.use(bodyParser.json());
app.set("sequelize", sequelize);
app.set("models", sequelize.models);

app.get("/contracts/:id", getProfile, async (req, res) => {
  const { Contract } = req.app.get("models");
  const profile_id = req.profile.id;

  const contract = await Contract.findOne({
    where: {
      id: req.params.id,
      [Op.or]: [{ ContractorId: profile_id }, { ClientId: profile_id }],
    },
  });

  if (!contract) return res.status(404).end();

  res.json(contract);
});

app.get("/contracts", getProfile, async (req, res) => {
  const { Contract } = req.app.get("models");
  const profile_id = req.profile.id;

  const contracts = await Contract.findAll({
    where: {
      [Op.or]: [{ ContractorId: profile_id }, { ClientId: profile_id }],
      [Op.and]: [{ status: "in_progress" }],
    },
  });

  if (!contracts) return res.status(404).end();

  res.json(contracts);
});

app.get("/jobs/unpaid", getProfile, async (req, res) => {
  const { Job } = req.app.get("models");
  const { Contract } = req.app.get("models");

  const profile_id = req.profile.id;

  const jobs = await Job.findAll({
    include: [
      {
        model: Contract,
        required: true,
        where: {
          [Op.or]: [{ ContractorId: profile_id }, { ClientId: profile_id }],
          [Op.and]: [{ status: "in_progress" }],
        },
      },
    ],

    where: { paid: { [Op.not]: true } },
  });

  if (!jobs) return res.status(404).end();

  res.json(jobs);
});

app.post("/jobs/:job_id/pay", getProfile, async (req, res) => {
  const { Profile, Job, Contract } = req.app.get("models");

  const id = req.profile.id;
  const job_id = req.params.job_id;

  const balance = req.profile.balance;

  const job = await Job.findOne({ where: { id: job_id } });

  if (!job) return res.status(404).end();
  else if (job.paid == true)
    return res.status(403).send("This job is already paid.").end();

  const contract = await Contract.findOne({ where: { id: job.ContractId } });

  if (balance >= job.price) {
    let transaction;
    try {
      const clientNewBalance = balance - job.price;
      transaction = await sequelize.transaction();

      await Profile.update(
        { balance: clientNewBalance },
        { where: { id: id } },
        { transaction }
      );
      await Profile.update(
        {
          balance: sequelize.literal(`balance + ${job.price}`),
        },
        { where: { id: contract.ContractorId } },
        { transaction }
      );
      await Job.update(
        { paid: true },
        { where: { id: job_id } },
        { transaction }
      );
      await transaction.commit();
    } catch (err) {
      if (transaction) {
        await transaction.rollback();
        throw err;
      }
    }
  } else
    return res.json(
      "This payment cannot be made due to client's insufficient balance."
    );

  res.json("Paid");
});

module.exports = app;
