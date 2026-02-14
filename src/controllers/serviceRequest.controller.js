const pool = require('../db/db');


// ==============================
// CREAR SOLICITUD
// ==============================
exports.create = async (req, res) => {
  try {

    if (!req.user || req.user.role !== "client") {
      return res.status(401).json({
        ok:false,
        error:"Solo clientes"
      });
    }

    let {
      service_type,
      price,
      address,
      latitude,
      longitude
    } = req.body;

    service_type = service_type?.toString().trim();
    price = Number(price);

    if(!service_type){
      return res.status(400).json({
        ok:false,
        error:"Servicio requerido"
      });
    }

    if(!address){
      return res.status(400).json({
        ok:false,
        error:"Dirección requerida"
      });
    }

    const result = await pool.query(`
      INSERT INTO service_request
      (client_id,service_type,address,latitude,longitude,price,status)
      VALUES($1,$2,$3,$4,$5,$6,'pending')
      RETURNING *
    `,
    [
      req.user.id,
      service_type,
      address,
      latitude,
      longitude,
      price
    ]);

    res.json({
      ok:true,
      data:result.rows[0]
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({
      ok:false,
      error:"Error creando solicitud"
    });
  }
};

// ==============================
// LISTAR SOLICITUDES
// ==============================
exports.list = async (req,res)=>{
  try{

    if(!req.user){
      return res.status(401).json({
        ok:false,
        error:"No autorizado"
      });
    }

    const result = await pool.query(
      `
      SELECT *
      FROM service_request
      WHERE client_id=$1
      ORDER BY id DESC
      `,
      [req.user.id]
    );

    res.json({
      ok:true,
      data:result.rows
    });

  }catch(err){
    console.error("🔥 ERROR LISTAR:",err);
    res.status(500).json({
      ok:false,
      error:"Error listando solicitudes"
    });
  }
};


// ==============================
// UPDATE STATUS (MVP UBER FLOW)
// ==============================
exports.updateStatus = async (req,res)=>{
  try{

    const { id } = req.params;
    const { status } = req.body;

    const allowed = [
      "pending",
      "accepted",
      "on_route",
      "completed",
      "cancelled"
    ];

    if(!allowed.includes(status)){
      return res.status(400).json({
        ok:false,
        error:"Estado inválido"
      });
    }

    await pool.query(
      `
      UPDATE service_request
      SET status=$1
      WHERE id=$2
      `,
      [status,id]
    );

    res.json({ok:true});

  }catch(err){
    console.error("🔥 ERROR UPDATE STATUS:",err);
    res.status(500).json({
      ok:false,
      error:"Error actualizando estado"
    });
  }
};
